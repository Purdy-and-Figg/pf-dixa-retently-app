// app.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('./config'); // Import the config module

const app = express();

app.use(express.json());

const customerInteractions = {};

app.post('/dixa-webhook', async (req, res) => {
  try {
    const dixaData = req.body;
    const customerEmail = dixaData.customer?.email;

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

    if (Math.random() <= 0.1) {
      const retentlyData = {
        email: customerEmail,
        first_name: dixaData.customer?.name,
        survey_link: `${config.SURVEY_LINK}?customer=${encodeURIComponent(customerEmail)}`, // Use the constant
      };

      await axios.post(config.RETENTLY_WEBHOOK_URL, retentlyData); // Use the constant
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

app.listen(config.PORT, () => { // Use the constant
  console.log(`Middleware listening on port ${config.PORT}`);
});