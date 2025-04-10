const express = require('express');
const router = express.Router();
const customerInteractionsController = require('./customerInteractionsController');

router.get('/', customerInteractionsController.getDixaCustomerInteractionsData);

module.exports = router;