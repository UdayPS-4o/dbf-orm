/**
 * Utility functions for DBF file operations
 */

const fs = require('fs');
const util = require('util');

// Convert fs functions to Promise-based versions
const open = util.promisify(fs.open);
const close = util.promisify(fs.close);
const read = util.promisify(fs.read);
const write = util.promisify(fs.write);
const stat = util.promisify(fs.stat);
const ftruncate = util.promisify(fs.ftruncate);

/**
 * Creates a Date object from year, month, and day values
 * 
 * @param {number} year - The year (4 digits)
 * @param {number} month - The month (1-12)
 * @param {number} day - The day (1-31)
 * @returns {Date} - The created Date object
 */
function createDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Gets the current date in DBF format
 * 
 * @returns {Object} - Object with year, month, and day properties
 */
function getDateParts() {
  const d = new Date();
  return {
    year: d.getFullYear() - 1900, // DBF stores years as offset from 1900
    month: d.getMonth() + 1,      // Month is 1-based in DBF
    day: d.getDate()              // Day of month
  };
}

/**
 * Zero-pads a value to the specified length
 * 
 * @param {string|number} value - The value to pad
 * @param {number} size - The desired length
 * @returns {string} - The padded string
 */
function zeroPad(value, size) {
  const str = String(value);
  return '0'.repeat(Math.max(0, size - str.length)) + str;
}

/**
 * Validates that a file can be opened for reading/writing
 * 
 * @param {string} filePath - Path to the file
 * @param {string} mode - File access mode ('r' for read, 'w' for write, etc.)
 * @returns {Promise<boolean>} - True if file can be accessed, throws an error otherwise
 */
async function validateFileAccess(filePath, mode) {
  let fd;
  try {
    fd = await open(filePath, mode);
    return true;
  } catch (err) {
    throw err;
  } finally {
    if (fd) await close(fd);
  }
}

module.exports = {
  open,
  close,
  read,
  write,
  stat,
  ftruncate,
  createDate,
  getDateParts,
  zeroPad,
  validateFileAccess
}; 