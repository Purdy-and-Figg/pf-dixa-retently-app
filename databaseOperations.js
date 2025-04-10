const pool = require('./databaseConfig');

async function saveCustomerInteraction(customerId, interactionType, interactionData) {
  try {
    const result = await pool.query(
      'INSERT INTO customer_interactions (customer_id, interaction_type, interaction_data) VALUES ($1, $2, $3) RETURNING *',
      [customerId, interactionType, interactionData]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error saving customer interaction:', error);
    throw error;
  }
}

async function getCustomerInteractions(page = 1, pageSize = 10) {
  try {
    const offset = (page - 1) * pageSize;
    const result = await pool.query(
      `SELECT * FROM customer_interactions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    const countResult = await pool.query(`SELECT COUNT(*) FROM customer_interactions`);
    const totalCount = parseInt(countResult.rows[0].count, 10);
    return {
      interactions: result.rows,
      totalCount,
    };
  } catch (error) {
    console.error('Error fetching customer interactions:', error);
    throw error;
  }
}

async function getCustomerInteractionById(id) {
  try {
    const result = await pool.query(
      'SELECT * FROM customer_interactions WHERE id = $1',
      [id]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching customer interaction by ID:', error);
    throw error;
  }
}

async function updateCustomerInteraction(id, updates) {
  try {
    const setClauses = [];
    const values = [];
    let valueIndex = 1;

    for (const key in updates) {
      if (Object.hasOwnProperty.call(updates, key)) {
        setClauses.push(`${key} = $${valueIndex}`);
        values.push(updates[key]);
        valueIndex++;
      }
    }

    if (setClauses.length === 0) {
      return null; // No updates provided
    }

    const query = `
      UPDATE customer_interactions
      SET ${setClauses.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING *
    `;

    values.push(id);
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating customer interaction:', error);
    throw error;
  }
}

async function getInteractionsForRetently() {
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    // const result = await pool.query(
    //   `SELECT * FROM customer_interactions WHERE retently_sent = FALSE AND retently_scheduled_at <= $1::timestamptz`,
    //   [twelveHoursAgo]
    // );
    const twelveHoursAgoIST = getISTTimestamp(twelveHoursAgo);
    const query = `SELECT * FROM customer_interactions WHERE retently_sent = FALSE AND retently_scheduled_at <= $1::timestamptz`;
    console.log('twelveHoursAgo => ', twelveHoursAgo, twelveHoursAgoIST)
    const values = [twelveHoursAgoIST];
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('Error fetching interactions for Retently:', error);
    throw error;
  }
}

async function markRetentlySent(id) {
  try {
    await pool.query(`UPDATE customer_interactions SET retently_sent = TRUE WHERE id = $1`, [id]);
  } catch (error) {
    console.error('Error marking Retently sent:', error);
    throw error;
  }
}

async function checkExistingCustomer(customerId, email) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT EXISTS(SELECT 1 FROM customer_interactions WHERE customer_id = $1 OR (customer_id IS NULL AND interaction_data->>'requester'->>'email' = $2::text))",
      [customerId, email]
    );
    return result.rows[0].exists;
  } catch (error) {
    console.error('Error checking existing customer:', error);
    return true; // Assume exists to avoid processing if there's an error
  } finally {
    client.release();
  }
}

function getISTTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}+05:30`;
}

module.exports = {
  saveCustomerInteraction,
  getCustomerInteractions,
  getCustomerInteractionById,
  updateCustomerInteraction,
  getInteractionsForRetently,
  markRetentlySent,
  checkExistingCustomer,
};