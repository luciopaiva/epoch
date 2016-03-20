
import path = require('path');
import express = require('express');

express()
    .use('/', express.static(path.join(__dirname, '../public')))
    .listen(3000, '0.0.0.0');
