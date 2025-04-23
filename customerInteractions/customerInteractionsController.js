// dixaTest/dixaTestController.js
const { getCustomerInteractions } = require('../databaseOperations'); // Adjust path if needed

exports.getDixaCustomerInteractionsData = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = 10;
    const { interactions, totalCount } = await getCustomerInteractions(page, pageSize);
    const totalPages = Math.ceil(totalCount / pageSize);

    // Ensure page is within valid bounds
    if (page < 1) {
        page = 1;
      } else if (page > totalPages) {
        page = totalPages;
      }

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
        <a href="/logout" style="float: right;">Logout</a>
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


    const maxLinks = 5; // Maximum number of page links to display
    let startPage = Math.max(1, page - Math.floor(maxLinks / 2));
    let endPage = Math.min(totalPages, page + Math.floor(maxLinks / 2));

    if (endPage - startPage < maxLinks - 1) {
      startPage = Math.max(1, endPage - maxLinks + 1);
    }

    if (startPage > 1) {
      htmlTable += `<a href="?page=1">1</a>`;
      if (startPage > 2) {
        htmlTable += `<span>...</span>`;
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      htmlTable += `<a href="?page=${i}" ${page === i ? 'class="active"' : ''}>${i}</a>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        htmlTable += `<span>...</span>`;
      }
      htmlTable += `<a href="?page=${totalPages}">${totalPages}</a>`;
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
};