require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const ExcelJS = require('exceljs');
const base64 = require('base-64');
const bodyParser = require('body-parser');
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
app.use(express.json());

// Function to store data in Excel (remains as is)
async function storeDataInExcel(data) {
  try {
    const workbook = new ExcelJS.Workbook();
    let worksheet;

    try {
      await workbook.xlsx.readFile('dixa_data.xlsx');
      worksheet = workbook.getWorksheet(1);
    } catch (error) {
      worksheet = workbook.addWorksheet('Dixa Data');
      worksheet.addRow(Object.keys(data));
    }

    worksheet.addRow(Object.values(data));
    await workbook.xlsx.writeFile('dixa_data.xlsx');
    console.log('Data stored in Excel.');
  } catch (error) {
    console.error('Error storing data in Excel:', error);
  }
}

async function storeDataInDB(customerId, interactionData) {
  const interactionType = 'webhook_event';
  try {
    const newInteraction = await saveCustomerInteraction(customerId, interactionType, interactionData);
    console.log('Webhook data saved to PostgreSQL:', newInteraction);
  } catch (error) {
    console.error('Error saving webhook data:', error);
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
      console.log('authenticateBasicAuth Middleware ', username, password);
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
    const interactionsToSend = await getInteractionsForRetently();

    for (const interaction of interactionsToSend) {
      const retentlyData = {
        email: interaction.interaction_data?.requester?.email,
        first_name: interaction.interaction_data?.requester?.name,
        last_name: '',
      };

      try {
        await axios.post(config.RETENTLY_WEBHOOK_URL, retentlyData);
        console.log(`Data sent to Retently for ${interaction.customer_id}.`);
        await markRetentlySent(interaction.id); // Mark as sent in the database
      } catch (error) {
        console.error(`Error sending data to Retently for ${interaction.customer_id}:`, error);
        // Consider logging the error or implementing a retry mechanism
      }
    }
  } catch (error) {
    console.error('Error processing Retently queue:', error);
  }
}

app.post('/dixa-webhook', bodyParser.json(), authenticateBasicAuth, async (req, res) => {
  try {
    const dixaData = req.body.data;
    console.log('dixaData => ', dixaData);
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
    await pool.query(
      `UPDATE customer_interactions SET retently_scheduled_at = $1 WHERE customer_id = $2`,
      [new Date(Date.now() + 12 * 60 * 60 * 1000), customerId]
    );

    console.log(`Retently sending scheduled for ${customerId} in 12 hours.`);

    res.status(200).send('Webhook processed. Retently sending scheduled.');
  } catch (error) {
    console.error('Error processing Dixa webhook:', error);
    res.status(500).send('Internal server error.');
  }
});

app.get('/dixa-test', async (req, res) => {
  console.log('connected');

  try {
    const { getCustomerInteractions } = require('./databaseOperations');
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = 10;

    const { interactions, totalCount } = await getCustomerInteractions(page, pageSize);
    const totalPages = Math.ceil(totalCount / pageSize);

    let htmlTable = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Customer Interactions</title>
        <style>
          table {
            border-collapse: collapse;
            width: 80%;
            margin: 20px auto;
          }
          th, td {
            border: 1px solid black;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
          .pagination {
            display: flex;
            justify-content: center;
            margin-top: 20px;
          }
          .pagination a {
            padding: 8px 16px;
            text-decoration: none;
            border: 1px solid #ddd;
            background-color: white;
            color: black;
          }
          .pagination a.active {
            background-color: #4CAF50;
            color: white;
          }
          .pagination a:hover:not(.active) {
            background-color: #ddd;
          }
        </style>
      </head>
      <body>
        <h1>Customer Interactions</h1>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer ID</th>
              <th>Interaction Type</th>
              <th>Interaction Data</th>
              <th>Created At</th>
              <th>Retently Sent</th>
              <th>Retently Scheduled At</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (interactions && interactions.length > 0) {
      interactions.forEach((interaction) => {
        htmlTable += `
          <tr>
            <td>${interaction.id}</td>
            <td>${interaction.customer_id}</td>
            <td>${interaction.interaction_type}</td>
            <td>${JSON.stringify(interaction.interaction_data)}</td>
            <td>${interaction.created_at}</td>
            <td>${interaction.retently_sent}</td>
            <td>${interaction.retently_scheduled_at}</td>
          </tr>
        `;
      });
    } else {
      htmlTable += `
          <tr>
            <td colspan="7">No interactions found.</td>
          </tr>
        `;
    }

    htmlTable += `
          </tbody>
        </table>
        <div class="pagination">
    `;

    for (let i = 1; i <= totalPages; i++) {
      htmlTable += `<a href="?page=${i}" ${page === i ? 'class="active"' : ''}>${i}</a>`;
    }

    htmlTable += `
        </div>
      </body>
      </html>
    `;

    res.send(htmlTable);
  } catch (error) {
    console.error('Error fetching and displaying data:', error);
    res.status(500).send('Error retrieving data.');
  }
});

async function startServer() {
  await initializeDatabase(); // Initialize the database on server start

  // Schedule the Retently processing job (e.g., every minute for testing)
  setInterval(processRetentlyQueue, 60 * 1000); // 1 minute (for testing)

  app.listen(config.PORT, () => {
    console.log(`Middleware listening on port ${config.PORT}`);
  });
}

startServer();