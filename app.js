require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const ExcelJS = require('exceljs');
const base64 = require('base-64');
const bodyParser = require('body-parser');
const session = require('express-session'); // For session management
const customerIntractionsRoute = require('./customerInteractions/customerIntractionsRoute');
const {
  saveCustomerInteraction,
  getCustomerInteractions,
  getInteractionsForRetently,
  markRetentlySent,
} = require('./databaseOperations');
const pool = require('./databaseConfig');

const expectedWebhookUser = process.env.WEBHOOK_USERNAME;
const expectedWebhookPassword = process.env.WEBHOOK_PASSWORD;

const app = express();

app.use(bodyParser.urlencoded({ extended: true })); // For parsing form data
app.use(express.json());
app.use(express.static('public')); // To serve static files like login.html
app.use(
  session({
    secret: 'your-secret-key', // Replace with a strong, random key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to `true` in production if using HTTPS
  })
);

const users = {
  // Replace with a database in a real application
  username: 'admin',
  password: 'password123',
};

// Route to display the login form
app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

// Route to handle login submission
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (users.username === username  && users.password === password) {
    req.session.loggedIn = true;
    req.session.username = username;
    res.redirect('/dixa-test'); // Redirect to your data view
  } else {
    res.send('Login failed. <a href="/login">Try again</a>');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
      if (err) {
          console.error('Error destroying session:', err);
          // Handle the error appropriately (e.g., display an error page)
          res.status(500).send('Error logging out.');
      } else {
          res.redirect('/login'); // Redirect to the login page
      }
  });
});

// Middleware to protect routes
function ensureAuthenticated(req, res, next) {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    const tableExistsResult = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_interactions');"
    );
    const tableExists = tableExistsResult.rows[0].exists;

    if (!tableExists) {
      console.log('Table "customer_interactions" does not exist. Creating it...');
      await client.query(`
        CREATE TABLE customer_interactions (
          id SERIAL PRIMARY KEY,
          customer_id VARCHAR(255),
          interaction_type VARCHAR(255) NOT NULL,
          interaction_data JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          retently_sent BOOLEAN DEFAULT FALSE,
          retently_scheduled_at TIMESTAMP WITH TIME ZONE,
          UNIQUE (customer_id)
        );
      `);
      await client.query('CREATE INDEX idx_interaction_type ON customer_interactions (interaction_type);');
      console.log('Table "customer_interactions" created successfully.');
    } else {
      console.log('Table "customer_interactions" already exists.');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    client.release();
  }
}

async function processRetentlyQueue() {
  try {
    const isTestMode = process.env.IS_TEST_MODE === '1';
    const testEmailString = process.env.TEST_EMAIL_STRING || '';

    const interactionsToSend = await getInteractionsForRetently();
    console.log("Entered in processRetentlyQueue", interactionsToSend, { isTestMode, testEmailString });

    for (const interaction of interactionsToSend) {
      const customerEmail = interaction.interaction_data?.requester?.email;

      if (!customerEmail) {
        console.warn(`Skipping interaction ${interaction.id}: Customer email not found.`);
        continue; // Move to the next interaction
      }

      const retentlyData = {
        email: customerEmail,
        first_name: interaction.interaction_data?.requester?.name || '',
        last_name: '',
      };

      console.log("processRetentlyQueue", retentlyData);

      if (isTestMode) {
        if (customerEmail.includes(testEmailString)) {
          console.log(`[TEST MODE] Sending data to Retently for test customer: ${interaction.customer_id} (${customerEmail})`);
          try {
            await axios.post(config.RETENTLY_WEBHOOK_URL, retentlyData);
            console.log(`[TEST MODE] Data sent to Retently for ${interaction.customer_id}.`);
            await markRetentlySent(interaction.id); // Mark as sent in the database
          } catch (error) {
            console.error(`[TEST MODE] Error sending data to Retently for ${interaction.customer_id}:`, error);
            // Consider logging the error or implementing a retry mechanism
          }
        } else {
          console.warn(`[TEST MODE] Skipping sending email to production customer: ${interaction.customer_id} (${customerEmail})`);
          // Optionally log this skip in more detail
        }
      } else {
        // IS_TEST_MODE is 0, send to Retently for all customers
        try {
          await axios.post(config.RETENTLY_WEBHOOK_URL, retentlyData);
          console.log(`Data sent to Retently for ${interaction.customer_id} (${customerEmail}).`);
          await markRetentlySent(interaction.id); // Mark as sent in the database
        } catch (error) {
          console.error(`Error sending data to Retently for ${interaction.customer_id}:`, error);
          // Consider logging the error or implementing a retry mechanism
        }
      }
    }
  } catch (error) {
    console.error('Error processing Retently queue:', error);
  }
}

// Function to store data in Excel
async function storeDataInExcel(data) {
  try {
    const workbook = new ExcelJS.Workbook();
    let worksheet;

    // Check if the file exists and load it, or create a new one
    try {
      await workbook.xlsx.readFile('dixa_data.xlsx');
      worksheet = workbook.getWorksheet(1); // Get the first worksheet
    } catch (error) {
      worksheet = workbook.addWorksheet('Dixa Data'); // Create a new worksheet
      // Add headers if it's a new file
      worksheet.addRow(Object.keys(data));
    }

    // Add a new row with the data
    worksheet.addRow(Object.values(data));

    await workbook.xlsx.writeFile('dixa_data.xlsx');
    console.log('Data stored in Excel.');
  } catch (error) {
    console.error('Error storing data in Excel:', error);
  }
}

async function storeDataInDB(customerId, interactionData) {

  const interactionType = 'webhook_event'; // Or determine based on the event

  try {
    const newInteraction = await saveCustomerInteraction(customerId, interactionType, interactionData);
    // console.log('Webhook data saved to PostgreSQL:', newInteraction);
    // res.status(200).send('Webhook received and data persisted.');
  } catch (error) {
    console.error('Error saving webhook data:', error);
    // res.status(500).send('Internal Server Error');
  }
  
}

async function checkExistingCustomer(customerId, email) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT EXISTS(SELECT 1 FROM customer_interactions WHERE customer_id = $1 )",
      [email]
    );
    return result.rows[0].exists;
  } catch (error) {
    console.error('Error checking existing customer:', error);
    return true; // Assume exists to avoid processing if there's an error
  } finally {
    client.release();
  }
}

function authenticateBasicAuth(req, res, next) {
 
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.warn('Webhook received without Basic Auth header.');
    return res.status(401).send('Unauthorized: Missing or invalid Basic Auth header');
  }

  const base64Credentials = authHeader.split(' ')[1];
  try {
    const decodedCredentials = base64.decode(base64Credentials);
    const [username, password] = decodedCredentials.split(':');

    if (username === expectedWebhookUser && password === expectedWebhookPassword) {
      // Authentication successful, proceed to the next middleware or route handler
      next();
    } else {
      console.error('Webhook Basic Auth failed: Incorrect credentials.');
      return res.status(401).send('Unauthorized: Incorrect Basic Auth credentials');
    }
  } catch (error) {
    console.error('Error decoding Basic Auth header:', error);
    return res.status(400).send('Bad Request: Invalid Basic Auth header format');
  }
}

app.post('/dixa-webhook', bodyParser.json(), authenticateBasicAuth, async (req, res) => {
  try {
    const dixaData = req.body.data;
    // console.log('dixaData => ', dixaData);
    const customerEmail = dixaData.conversation.requester?.email;
    const customerId = dixaData.customer?.id || customerEmail;

    if (!customerEmail) {
      console.error('Customer email not found in Dixa data.');
      return res.status(400).send('Customer email is required.');
    }

    const isExistingCustomer = await checkExistingCustomer(customerId, customerEmail);

    if (isExistingCustomer) {
      console.log(`Customer with ID or Email ${customerId} already exists. Skipping.`);
      return res.status(200).send('Skipped due to previous interaction.');
    }

    const dataToStore = {
      email: customerEmail,
      name: dixaData.conversation.requester?.name,
      conversationId: dixaData.conversation?.csid,
      subject: dixaData.conversation?.subject,
      timestamp: new Date().toISOString(),
    };

    // Store data in Excel
    await storeDataInExcel(dataToStore);

    // Store data in DB
    await storeDataInDB(customerId, dixaData.conversation);

    // Schedule Retently sending
    await pool.query(`UPDATE customer_interactions SET retently_scheduled_at = $1 WHERE customer_id = $2`, [
      new Date(Date.now() + process.env.SENT_MAIL_AFTER * 60 * 60 * 1000),
      customerId,
    ]);

    console.log(`Retently sending scheduled for ${customerId} in ${process.env.SENT_MAIL_AFTER} hours.`);

    res.status(200).send('Webhook processed. Retently sending scheduled.');
  } catch (error) {
    console.error('Error processing Dixa webhook:', error);
    res.status(500).send('Internal server error.');
  }
});

app.use('/dixa-test', ensureAuthenticated, customerIntractionsRoute); // Mount the router

async function startServer() {
  await initializeDatabase(); // Initialize the database on server start

  // Schedule the Retently processing job (e.g., every minute for testing)
  setInterval(processRetentlyQueue, 60 * 1000); // 1 minute (for testing)

  app.listen(config.PORT, () => {
    console.log(`Middleware listening on port ${config.PORT}`);
  });
}

startServer();