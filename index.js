/**
 * DbfORM - A fully-featured ORM for DBF files
 */

// Re-export the DbfORM class and DELETED symbol
const { DbfORM, DELETED } = require('./src/DbfORM');

module.exports = {
  DbfORM,
  DELETED
}; 