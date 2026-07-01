require('dotenv').config();

const path = require('path');
const express = require('express');
const api = require('../api/index');

const app = express();
const root = path.join(__dirname, '..');
const port = Number(process.env.PORT) || 3000;

app.use(api);

app.use(express.static(path.join(root, 'public')));
app.use(express.static(root));

app.get('/', (req, res) => {
  res.sendFile(path.join(root, 'kibbisave_home_final.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(root, 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(root, 'signup.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const file = path.join(root, req.path.replace(/^\//, ''));
  if (file.startsWith(root) && require('fs').existsSync(file) && !require('fs').statSync(file).isDirectory()) {
    return res.sendFile(file);
  }
  next();
});

app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.listen(port, () => {
  console.log(`KibbiSave running at http://localhost:${port}`);
  console.log(`  Home:    http://localhost:${port}/`);
  console.log(`  API:     http://localhost:${port}/api/health`);
});
