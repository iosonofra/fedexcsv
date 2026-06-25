const express = require('express');
const router = express.Router();
const { getFedExDefaults } = require('../services/fedexExcel');

router.get('/defaults', async (req, res) => {
  try {
    const defaults = await getFedExDefaults();
    res.json(defaults);
  } catch (error) {
    console.error('Error fetching FedEx defaults:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
