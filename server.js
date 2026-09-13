const dotenv = require('dotenv');

// Load environment variables FIRST
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const zohoAnalytics = require('./services/zohoAnalytics');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
  });

// Routes
app.get('/', (req, res) => {
  res.render('landing');
});

// Onboarding route
app.get('/onboard', (req, res) => {
  res.render('index', { clientData: {} });
});

app.post('/onboard', async (req, res) => {
  try {
    // Validate passwords match
    if (req.body.password !== req.body.confirmPassword) {
      return res.render('index', {
        errors: { password: { message: 'Passwords do not match' } },
        clientData: req.body
      });
    }

    const clientData = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,
      company: req.body.company,
      position: req.body.position,
      password: req.body.password,
      address: {
        street: req.body.street,
        city: req.body.city,
        state: req.body.state,
        zipCode: req.body.zipCode,
        country: req.body.country
      }
    };

    // Save to MongoDB
    const newClient = new require('./models/Client')(clientData);
    await newClient.save();

    // Automatically log in the user after successful onboarding
    req.session.userId = newClient._id;
    req.session.clientName = `${newClient.firstName} ${newClient.lastName}`;
    
    res.render('success', { client: newClient });
  } catch (error) {
    console.error('Error saving client:', error);
    
    // Re-render form with errors
    res.render('index', { 
      errors: error.errors || { message: error.message },
      clientData: req.body 
    });
  }
});

// Get all clients (admin view)
app.get('/clients', async (req, res) => {
  try {
    const clients = await require('./models/Client').find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN ROUTES
app.get('/login', (req, res) => {
  res.render('login', { error: null, email: '' });
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const Client = require('./models/Client');
    
    // Find client by email
    const client = await Client.findOne({ email });
    
    if (!client) {
      return res.render('login', { 
        error: 'User not found. Please check your email or complete onboarding.',
        email 
      });
    }
    
    // Compare password with hashed password
    const isPasswordValid = await client.comparePassword(password);
    
    if (isPasswordValid) {
      // Set session
      req.session.userId = client._id;
      req.session.clientName = `${client.firstName} ${client.lastName}`;
      return res.redirect('/dashboard');
    } else {
      return res.render('login', { 
        error: 'Invalid password. Please try again.',
        email 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { 
      error: 'An error occurred during login. Please try again.',
      email: req.body.email 
    });
  }
});

// PASSWORD RESET ROUTES
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { message: null, error: null, email: '' });
});

app.post('/forgot-password', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const genericMessage = 'If an account exists for that email, a password reset link has been sent.';

  try {
    const Client = require('./models/Client');
    const client = await Client.findOne({ email });

    if (client) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      client.passwordResetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      client.passwordResetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await client.save();

      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
      console.log(`Password reset link for ${email}: ${resetUrl}`);
    }

    res.render('forgot-password', { message: genericMessage, error: null, email: '' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.render('forgot-password', {
      message: null,
      error: 'Unable to process your request right now. Please try again.',
      email
    });
  }
});

app.get('/reset-password/:token', async (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const Client = require('./models/Client');
    const client = await Client.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: { $gt: new Date() }
    });

    if (!client) {
      return res.status(400).render('reset-password', {
        token: '',
        error: 'This password reset link is invalid or has expired.',
        message: null
      });
    }

    res.render('reset-password', { token: req.params.token, error: null, message: null });
  } catch (error) {
    console.error('Password reset page error:', error);
    res.status(400).render('reset-password', {
      token: '',
      error: 'This password reset link is invalid or has expired.',
      message: null
    });
  }
});

app.post('/reset-password/:token', async (req, res) => {
  const { password, confirmPassword } = req.body;
  const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const renderError = (error) => res.status(400).render('reset-password', {
    token: req.params.token,
    error,
    message: null
  });

  if (!password || password.length < 6) {
    return renderError('Password must be at least 6 characters long.');
  }
  if (password !== confirmPassword) {
    return renderError('Passwords do not match.');
  }

  try {
    const Client = require('./models/Client');
    const client = await Client.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: { $gt: new Date() }
    });

    if (!client) {
      return renderError('This password reset link is invalid or has expired.');
    }

    client.password = password;
    client.passwordResetTokenHash = null;
    client.passwordResetTokenExpiresAt = null;
    await client.save();

    res.render('reset-password', {
      token: '',
      error: null,
      message: 'Your password has been updated. You can now sign in.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    renderError('Unable to reset your password right now. Please try again.');
  }
});

// DASHBOARD ROUTE
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);
    
    if (!client) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    res.render('dashboard', { client });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('login', { 
      error: 'An error occurred. Please try again.',
      email: ''
    });
  }
});

// PROFILE ROUTE
app.get('/profile', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);
    
    if (!client) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    res.render('profile', { client });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).render('login', { 
      error: 'An error occurred. Please try again.',
      email: ''
    });
  }
});

// UPLOAD PREVIEW ROUTE
app.get('/upload', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);

    if (!client) {
      req.session.destroy();
      return res.redirect('/login');
    }

    res.render('upload');
  } catch (error) {
    console.error('Upload page error:', error);
    res.status(500).render('login', {
      error: 'An error occurred. Please try again.',
      email: ''
    });
  }
});

// BILLING / CLIENT CHECK ROUTE
app.get('/billing', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);

    if (!client) {
      req.session.destroy();
      return res.redirect('/login');
    }

    res.render('billing');
  } catch (error) {
    console.error('Billing page error:', error);
    res.status(500).render('login', {
      error: 'An error occurred. Please try again.',
      email: ''
    });
  }
});

// LOGOUT ROUTE
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect('/dashboard');
    }
    res.redirect('/');
  });
});

// ZOHO ANALYTICS OAUTH ROUTES
// Redirect to Zoho login
app.get('/auth/zoho', requireAuth, (req, res) => {
  const authUrl = zohoAnalytics.getAuthorizationUrl();
  console.log('Redirecting to Zoho OAuth URL:', authUrl);
  res.redirect(authUrl);
});

// Zoho callback handler
app.get('/auth/zoho/callback', requireAuth, async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect('/dashboard?error=auth_failed');
    }

    // Get access token
    const tokens = await zohoAnalytics.getAccessToken(code);

    // Update user with Zoho tokens
    const Client = require('./models/Client');
    await Client.findByIdAndUpdate(
      req.session.userId,
      {
        zohoAccessToken: tokens.accessToken,
        zohoRefreshToken: tokens.refreshToken,
        zohoTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        zohoGrantedScopes: tokens.grantedScopes,
        zohoOrgId: await zohoAnalytics.getOrganizationId(tokens.accessToken)
      }
    );

    res.redirect('/dashboard?connected=zoho');
  } catch (error) {
    console.error('Zoho OAuth error:', error);
    res.redirect('/dashboard?error=zoho_auth_failed');
  }
});

// ANALYTICS API ENDPOINTS
// Get spending by category
app.get('/api/analytics/spending-by-category', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);

    if (!client || !client.zohoAccessToken) {
      return res.status(401).json({ error: 'Zoho not connected. Please connect your account.' });
    }

    // Check if token needs refresh
    if (client.zohoTokenExpiresAt < new Date()) {
      const refreshed = await zohoAnalytics.refreshAccessToken(client.zohoRefreshToken);
      client.zohoAccessToken = refreshed.accessToken;
      client.zohoTokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
      await client.save();
    }

    const data = await zohoAnalytics.getSpendingByCategory(
      client.zohoAccessToken,
      client.zohoAccountId,
      client.zohoOrgId
    );

    res.json(data);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Get income vs expenses
app.get('/api/analytics/income-expenses', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);

    if (!client || !client.zohoAccessToken) {
      return res.status(401).json({ error: 'Zoho not connected' });
    }

    // Check if token needs refresh
    if (client.zohoTokenExpiresAt < new Date()) {
      const refreshed = await zohoAnalytics.refreshAccessToken(client.zohoRefreshToken);
      client.zohoAccessToken = refreshed.accessToken;
      client.zohoTokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
      await client.save();
    }

    const data = await zohoAnalytics.getIncomeVsExpenses(
      client.zohoAccessToken,
      client.zohoAccountId,
      client.zohoOrgId
    );

    res.json(data);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Get transactions
app.get('/api/analytics/transactions', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);

    if (!client || !client.zohoAccessToken) {
      return res.status(401).json({ error: 'Zoho not connected' });
    }

    // Check if token needs refresh
    if (client.zohoTokenExpiresAt < new Date()) {
      const refreshed = await zohoAnalytics.refreshAccessToken(client.zohoRefreshToken);
      client.zohoAccessToken = refreshed.accessToken;
      client.zohoTokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
      await client.save();
    }

    const data = await zohoAnalytics.getTransactions(
      client.zohoAccessToken,
      client.zohoAccountId,
      client.zohoOrgId
    );

    res.json(data);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Get goals
app.get('/api/analytics/goals', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);

    if (!client || !client.zohoAccessToken) {
      return res.status(401).json({ error: 'Zoho not connected' });
    }

    // Check if token needs refresh
    if (client.zohoTokenExpiresAt < new Date()) {
      const refreshed = await zohoAnalytics.refreshAccessToken(client.zohoRefreshToken);
      client.zohoAccessToken = refreshed.accessToken;
      client.zohoTokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
      await client.save();
    }

    const data = await zohoAnalytics.getGoals(
      client.zohoAccessToken,
      client.zohoAccountId,
      client.zohoOrgId
    );

    res.json(data);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Get savings rate
app.get('/api/analytics/savings-rate', requireAuth, async (req, res) => {
  try {
    const Client = require('./models/Client');
    const client = await Client.findById(req.session.userId);

    if (!client || !client.zohoAccessToken) {
      return res.status(401).json({ error: 'Zoho not connected' });
    }

    // Check if token needs refresh
    if (client.zohoTokenExpiresAt < new Date()) {
      const refreshed = await zohoAnalytics.refreshAccessToken(client.zohoRefreshToken);
      client.zohoAccessToken = refreshed.accessToken;
      client.zohoTokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
      await client.save();
    }

    const data = await zohoAnalytics.getSavingsRate(
      client.zohoAccessToken,
      client.zohoAccountId,
      client.zohoOrgId
    );

    res.json(data);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

/**
 * Run the Application
Start MongoDB (make sure MongoDB is running on localhost:27017)
Install dependencies: npm install
Run in development: npm run dev
Open browser: http://localhost:3000
 */