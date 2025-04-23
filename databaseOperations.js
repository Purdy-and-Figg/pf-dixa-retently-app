// databaseOperations.js
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
    const result = await pool.query(
      `SELECT * FROM customer_interactions WHERE retently_sent = FALSE AND retently_scheduled_at <= $1`,
      [twelveHoursAgo]
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching interactions for Retently:', error);
    throw error;
  }
}

async function markRetentlySent(id) {
  try {
    await pool.query(
      `UPDATE customer_interactions SET retently_sent = TRUE WHERE id = $1`,
      [id]
    );
  } catch (error) {
    console.error('Error marking Retently sent:', error);
    throw error;
  }
}

module.exports = {
  saveCustomerInteraction,
  getCustomerInteractions,
  getCustomerInteractionById,
  updateCustomerInteraction,
  getInteractionsForRetently,
  markRetentlySent,
};