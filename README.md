# Dixa-Retently Middleware

This Node.js application acts as middleware between Dixa and Retently, processing Dixa conversation resolved webhooks, applying random sampling, and forwarding data to Retently for NPS surveys. It also stores the Dixa data in a local Excel file.

## Prerequisites

* Node.js (version 14 or higher)
* npm (Node Package Manager)
* Retently Account with a Generic Webhook campaign and an NPS survey set up.
* Dixa Account with webhooks enabled.

## Setup

1.  **Clone the Repository (if applicable):**
    ```bash
    git clone <your_repository_url>
    cd dixa-retently-middleware
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Create a `.env` File:**
    * Create a file named `.env` in the root directory of the project.
    * Add the following environment variables:
        ```
        RETENTLY_WEBHOOK_URL=YOUR_RETENTLY_WEBHOOK_URL
        PORT=3000
        ```
        * Replace `YOUR_RETENTLY_WEBHOOK_URL` with the Generic Webhook URL from your Retently campaign.
        * You can change the port if needed.

4.  **Configure `config.js`:**
    * Open the `config.js` file and replace `YOUR_SURVEY_LINK` with the actual survey link from your Retently NPS survey.
    * Ensure that the PORT value matches the PORT value set in the .env file.

5.  **Run the Application:**
    ```bash
    node app.js
    ```
    * The application will start and listen on the specified port.

6.  **Configure Dixa Webhook:**
    * In your Dixa account, navigate to the webhook settings.
    * Create a new webhook with the following configuration:
        * **Webhook URL:** `http://127.0.0.1:3000/dixa-webhook` (or `http://localhost:3000/dixa-webhook` if running locally, or your server's public ip if running on a server).
        * **Trigger Event:** "Conversation Resolved" (or the equivalent event).
        * **HTTP Method:** POST.
        * **Content Type:** application/json.

## Functionality

* **Dixa Webhook Processing:**
    * Receives webhooks from Dixa when a conversation is marked as resolved.
    * Checks if it's the customer's first interaction.
    * Randomly samples 10% of first-time interaction conversations.
* **Data Mapping and Forwarding:**
    * Maps relevant data from the Dixa webhook to the Retently Generic Webhook format.
    * Forwards the data to Retently using the specified `RETENTLY_WEBHOOK_URL`.
    * Constructs a unique survey link with the customer's email and sends it to retently.
* **Local Excel Storage:**
    * Stores the Dixa conversation data in a local Excel file (`dixa_data.xlsx`).
    * Creates the file if it doesn't exist, and adds new rows for each processed conversation.
    * Includes customer email, name, conversation ID, and a timestamp.

## Important Notes

* **Local Development:**
    * When running locally, use `http://127.0.0.1:3000/dixa-webhook` as your Dixa webhook URL.
    * If you need to test Dixa webhooks from an external service, you might need to use a tool like ngrok to expose your local server.
* **Production:**
    * For production environments, use a proper server with a public IP address.
    * Implement robust error handling and logging.
    * Replace the in-memory customer interaction tracking with a persistent database.
    * Secure your application and API endpoints.
    * Consider implementing file rotation for the excel file.
* **Security:**
    * Protect your Retently API keys and webhook URLs.
    * Validate and sanitize all incoming data.
    * Use HTTPS.
* **Excel File:**
    * The excel file is saved in the same directory as the app.js file.
    * For large data sets a database is recommended.
* **Dependencies:**
    * This application uses `express`, `axios`, `dotenv`, `uuid` and `exceljs` node packages.