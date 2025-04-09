// app.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const ExcelJS = require('exceljs');

const base64 = require('base-64');

const bodyParser = require('body-parser');
const { saveCustomerInteraction } = require('./databaseOperations');

const expectedWebhookUser = process.env.WEBHOOK_USERNAME;
const expectedWebhookPassword = process.env.WEBHOOK_PASSWORD;

const app = express();

app.use(express.json());

const customerInteractions = {};

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
    console.log('Webhook data saved to PostgreSQL:', newInteraction);
    // res.status(200).send('Webhook received and data persisted.');
  } catch (error) {
    console.error('Error saving webhook data:', error);
    // res.status(500).send('Internal Server Error');
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

app.post('/dixa-webhook', bodyParser.json(), authenticateBasicAuth, async (req, res) => {
  try {
    const dixaData = req.body.data;
    console.log('dixaData => ', dixaData);
    const customerEmail = dixaData.conversation.requester?.email;

    

    if (!customerEmail) {
      console.error('Customer email not found in Dixa data.');
      return res.status(400).send('Customer email is required.');
    }

    if (!customerInteractions[customerEmail]) {
      customerInteractions[customerEmail] = true;
    } else {
      console.log(`Customer ${customerEmail} has interacted before. Skipping.`);
      return res.status(200).send('Skipped due to previous interaction.');
    }

    const dataToStore = {
      email: customerEmail,
      name: dixaData.conversation.requester?.name,
      conversationId: dixaData.conversation?.csid, //Add conversation ID
      subject: dixaData.conversation?.subject,
      // Add other data points you want to store
      timestamp: new Date().toISOString(),
    };

    // Store data in Excel
    await storeDataInExcel(dataToStore);

    // Store data in DB
    await storeDataInDB(customerEmail, dixaData.conversation);

    if (Math.random() <= 0.1) {
      const retentlyData = {
        email: customerEmail,
        first_name:dixaData.customer?.name,
        last_name: ""
    };

      await axios.post(config.RETENTLY_WEBHOOK_URL, retentlyData);
      console.log(`Data sent to Retently for ${customerEmail}.`);
      res.status(200).send('Data sent to Retently.');
    } else {
      console.log(`Sample skipped for ${customerEmail}.`);
      res.status(200).send('Sample skipped.');
    }
  } catch (error) {
    console.error('Error processing Dixa webhook:', error);
    res.status(500).send('Internal server error.');
  }
});

app.get('/dixa-test', async (req, res) => {
    console.log("connected");
})

app.listen(config.PORT, () => {
  console.log(`Middleware listening on port ${config.PORT}`);
});