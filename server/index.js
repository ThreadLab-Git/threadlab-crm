require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const leadsRouter     = require('./routes/leads');
const eventsRouter    = require('./routes/events');
const whatsappRouter  = require('./routes/whatsapp');
const usersRouter     = require('./routes/users');

const app = express();

app.use(cors());
app.use(express.json());

// Serve the frontend from /public
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/leads',     leadsRouter);
app.use('/api/events',    eventsRouter);
app.use('/api/whatsapp',  whatsappRouter);
app.use('/api/users',     usersRouter);

// Fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  Threadlab CRM server running → http://localhost:${PORT}`);
});
