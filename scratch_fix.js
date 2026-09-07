const { DatabaseSync } = require('node:sqlite');
const config = require('./src/config');
const db = new DatabaseSync(config.databasePath);

db.prepare(`UPDATE leads SET phone = replace(whatsapp_id, '@lid', '') WHERE whatsapp_id LIKE '%@lid'`).run();
db.prepare(`UPDATE leads SET phone = replace(whatsapp_id, '@c.us', '') WHERE whatsapp_id LIKE '%@c.us'`).run();
console.log('Done');
