/**
 * DBF File Implementation
 * A customized version of the dbffile module with modifications
 */

const assert = require('assert');
const iconv = require('iconv-lite');
const path = require('path');
const fs = require('fs');
const { validateFieldDescriptor } = require('./field-descriptor');
const { isValidFileVersion } = require('./file-version');
const { normaliseOpenOptions, normaliseCreateOptions } = require('./options');
const { open, close, read, write, stat, ftruncate, createDate } = require('./utils');

/** Represents a DBF file. */
class DBFFile {
  constructor() {
    /** Full path to the DBF file. */
    this.path = '';
    /** Total number of records in the DBF file. (NB: includes deleted records). */
    this.recordCount = 0;
    /** Date of last update as recorded in the DBF file header. */
    this.dateOfLastUpdate = new Date();
    /** Metadata for all fields defined in the DBF file. */
    this.fields = [];
    // Private.
    this._readMode = 'strict';
    this._encoding = '';
    this._includeDeletedRecords = false;
    this._recordsRead = 0;
    this._headerLength = 0;
    this._recordLength = 0;
    this._memoPath = '';
    this._version = 0;
  }

  /** Opens an existing DBF file. */
  static async open(path, options) {
    return openDBF(path, options);
  }

  /** Creates a new DBF file with no records. */
  static async create(path, fields, options) {
    return createDBF(path, fields, options);
  }

  /**
   * Reads a subset of records from this DBF file. If the `includeDeletedRecords` option is set, then deleted records
   * are included in the results, otherwise they are skipped. Deleted records have the property `[DELETED]: true`,
   * using the `DELETED` symbol exported from this library.
   */
  readRecords(maxCount = 10000000) {
    return readRecordsFromDBF(this, maxCount);
  }

  /** Appends the specified records to this DBF file. */
  appendRecords(records) {
    return appendRecordsToDBF(this, records);
  }

  /**
   * Iterates over each record in this DBF file. If the `includeDeletedRecords` option is set, then deleted records
   * are yielded, otherwise they are skipped. Deleted records have the property `[DELETED]: true`, using the `DELETED`
   * symbol exported from this library.
   */
  async *[Symbol.asyncIterator]() {
    while (this._recordsRead !== this.recordCount) {
      yield* await this.readRecords(100);
    }
  }
}

/** Symbol used for detecting deleted records when the `includeDeletedRecords` option is used. */
const DELETED = Symbol();

//-------------------- Private implementation starts here --------------------
async function openDBF(path, opts) {
  let options = normaliseOpenOptions(opts);
  let fd = 0;
  try {
    // Open the file and create a buffer to read through.
    fd = await open(path, 'r');
    let buffer = Buffer.alloc(32);
    
    // Read various properties from the header record.
    await read(fd, buffer, 0, 32, 0);
    let fileVersion = buffer.readUInt8(0);
    let lastUpdateY = buffer.readUInt8(1); // number of years after 1900
    let lastUpdateM = buffer.readUInt8(2); // 1-based
    let lastUpdateD = buffer.readUInt8(3); // 1-based
    const dateOfLastUpdate = createDate(lastUpdateY + 1900, lastUpdateM, lastUpdateD);
    let recordCount = buffer.readInt32LE(4);
    let headerLength = buffer.readInt16LE(8);
    let recordLength = buffer.readInt16LE(10);
    let memoPath;
    
    // Validate the file version. Skip validation if reading in 'loose' mode.
    if (options.readMode !== 'loose' && !isValidFileVersion(fileVersion)) {
      throw new Error(`File '${path}' has unknown/unsupported dBase version: ${fileVersion}.`);
    }
    
    // Locate the memo file, if any. Allow missing memo files if reading in 'loose' mode.
    if (fileVersion === 0x83 || fileVersion === 0x8b) {
      for (const ext of ['.dbt', '.DBT']) {
        memoPath = path.slice(0, -path.extname(path).length) + ext;
        let foundMemoFile = await stat(memoPath).catch(() => 'missing') !== 'missing';
        if (foundMemoFile)
          break;
        memoPath = undefined;
      }
      if (options.readMode !== 'loose' && !memoPath) {
        throw new Error(`Memo file not found for file '${path}'.`);
      }
    }
    
    // Read all the field descriptors (starting from byte 32 of the header).
    buffer = Buffer.alloc(headerLength - 32 - 1);
    await read(fd, buffer, 0, buffer.length, 32);
    
    // Parse the field descriptors
    let fields = [];
    let offset = 0;
    while (offset < buffer.length && buffer[offset] !== 0x0D) {
      // Get the field name. It's stored as a null-terminated string.
      // If the first byte is a null, we're done reading field descriptors.
      if (buffer[offset] === 0) break;
      let fieldName = '';
      for (let i = 0; i < 11; ++i) {
        let val = buffer[offset + i];
        if (val === 0) break;
        fieldName += String.fromCharCode(val);
      }
      fieldName = fieldName.trim();
      
      // Get the field type, size, and any decimals.
      let fieldType = String.fromCharCode(buffer[offset + 11]);
      let fieldSize = buffer[offset + 16];
      let fieldDecimals = buffer[offset + 17];
      
      // Add to field descriptor list
      fields.push({
        name: fieldName,
        type: fieldType,
        size: fieldSize,
        decimalPlaces: fieldDecimals || undefined
      });
      
      // Move to the next field descriptor
      offset += 32;
    }
    
    // Create and return the DBFFile instance.
    let result = new DBFFile();
    result.path = path;
    result.recordCount = recordCount;
    result.dateOfLastUpdate = dateOfLastUpdate;
    result.fields = fields;
    result._readMode = options.readMode;
    result._encoding = options.encoding;
    result._includeDeletedRecords = options.includeDeletedRecords;
    result._recordsRead = 0;
    result._headerLength = headerLength;
    result._recordLength = recordLength;
    result._memoPath = memoPath;
    result._version = fileVersion;
    
    return result;
  } 
  finally {
    if (fd) await close(fd);
  }
}

async function createDBF(path, fields, opts) {
  let options = normaliseCreateOptions(opts);
  let fileVersion = options.fileVersion;
  
  // Validate all field descriptors
  for (const field of fields) {
    validateFieldDescriptor(field, fileVersion);
  }
  
  // Calculate the header and record length
  let headerLength = 32 + (32 * fields.length) + 1;
  let recordLength = 1; // 1 byte for deleted flag
  for (const field of fields) {
    recordLength += field.size;
  }
  
  // Create the header buffer
  let header = Buffer.alloc(headerLength);
  header.fill(0);
  
  // Write the file version, date, and record/header sizes
  header.writeUInt8(fileVersion, 0);
  const now = new Date();
  header.writeUInt8(now.getFullYear() - 1900, 1);
  header.writeUInt8(now.getMonth() + 1, 2);
  header.writeUInt8(now.getDate(), 3);
  header.writeInt32LE(0, 4); // No records initially
  header.writeInt16LE(headerLength, 8);
  header.writeInt16LE(recordLength, 10);
  
  // Write field descriptors
  let offset = 32;
  for (const field of fields) {
    // Write field name (null-terminated)
    const nameBuffer = Buffer.from(field.name.padEnd(11, '\0'));
    nameBuffer.copy(header, offset, 0, 11);
    
    // Write field type, size, and decimals
    header.writeUInt8(field.type.charCodeAt(0), offset + 11);
    header.writeUInt8(field.size, offset + 16);
    if (field.decimalPlaces !== undefined) {
      header.writeUInt8(field.decimalPlaces, offset + 17);
    }
    
    offset += 32;
  }
  
  // Write header terminator
  header.writeUInt8(0x0D, offset);
  
  // Write the EOF marker
  let eof = Buffer.from([0x1A]);
  
  // Write the header and EOF marker to the file
  let fd = 0;
  try {
    fd = await open(path, 'w');
    await write(fd, header, 0, header.length, 0);
    await write(fd, eof, 0, eof.length, header.length);
  } 
  finally {
    if (fd) await close(fd);
  }
  
  // Open the newly created file and return it
  return openDBF(path, { 
    encoding: options.encoding, 
    readMode: 'strict',
    includeDeletedRecords: false
  });
}

async function readRecordsFromDBF(dbf, maxCount) {
  // Don't try to read more records than there are in the file.
  maxCount = Math.min(maxCount, dbf.recordCount - dbf._recordsRead);
  if (maxCount <= 0) return [];
  
  // Open the file and create a buffer for reading records.
  let fd = 0;
  try {
    fd = await open(dbf.path, 'r');
    let buffer = Buffer.alloc(dbf._recordLength);
    let records = [];
    let recordsToRead = maxCount;
    
    // File position for the record we want to start reading from.
    let pos = dbf._headerLength + (dbf._recordsRead * dbf._recordLength);
    
    // Start reading records.
    while (recordsToRead > 0) {
      // Read the next record into the buffer.
      await read(fd, buffer, 0, buffer.length, pos);
      pos += buffer.length;
      
      // Check if the record is marked as deleted.
      let deleted = buffer[0] === 0x2A; // '*' character
      
      // Skip deleted records if the option is not set.
      if (deleted && !dbf._includeDeletedRecords) {
        --recordsToRead;
        ++dbf._recordsRead;
        continue;
      }
      
      // Parse the record.
      let record = {};
      if (deleted) record[DELETED] = true;
      let offset = 1; // Skip the deleted flag
      
      // Helper functions to extract data
      let substrAt = (start, len, enc) => iconv.decode(buffer.slice(start, start + len), enc);
      let int32At = (start, len) => buffer.slice(start, start + len).readInt32LE(0);
      
      // Process each field in the record
      for (const field of dbf.fields) {
        // Get the encoding for this field
        let encoding = typeof dbf._encoding === 'string' ? 
          dbf._encoding : 
          dbf._encoding[field.name] || dbf._encoding.default;
        
        // Extract the field value based on its type
        let value;
        switch (field.type) {
          case 'C': // Character
            value = substrAt(offset, field.size, encoding).trim();
            break;
          case 'N': // Numeric
            value = parseFloat(substrAt(offset, field.size, encoding).trim());
            if (isNaN(value)) value = null;
            break;
          case 'F': // Float
            value = parseFloat(substrAt(offset, field.size, encoding).trim());
            if (isNaN(value)) value = null;
            break;
          case 'L': // Logical
            {
              const c = String.fromCharCode(buffer[offset]).toUpperCase();
              value = (c === 'T' || c === 'Y') ? true : (c === 'F' || c === 'N') ? false : null;
            }
            break;
          case 'D': // Date
            {
              const str = substrAt(offset, field.size, encoding).trim();
              if (str.length >= 8) {
                const year = parseInt(str.substring(0, 4), 10);
                const month = parseInt(str.substring(4, 6), 10);
                const day = parseInt(str.substring(6, 8), 10);
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                  value = createDate(year, month, day);
                }
                else value = null;
              }
              else value = null;
            }
            break;
          case '0': // NullFlags or special field
            {
              // For type '0', get the raw buffer
              const rawBytes = buffer.slice(offset, offset + field.size);
              // For display purposes, convert to a byte string format
              const byteStr = "b'" + Array.from(rawBytes)
                .map(b => '\\x' + b.toString(16).padStart(2, '0'))
                .join('') + "'";
              value = byteStr;
            }
            break;
          // Other field types can be added here as needed
          default:
            // Skip unsupported field types in loose mode
            if (dbf._readMode === 'loose') {
              value = null;
            } else {
              throw new Error(`Unsupported field type: '${field.type}'`);
            }
        }
        
        // Add the field to the record
        record[field.name] = value;
        
        // Move to the next field
        offset += field.size;
      }
      
      // Add the record to our results and continue.
      records.push(record);
      --recordsToRead;
      ++dbf._recordsRead;
    }
    
    return records;
  } 
  finally {
    if (fd) await close(fd);
  }
}

async function appendRecordsToDBF(dbf, records) {
  // Validate the records based on the field descriptors
  for (const record of records) {
    validateRecord(dbf.fields, record);
  }
  
  // Open the file for appending
  let fd = 0;
  try {
    fd = await open(dbf.path, 'r+');
    
    // Calculate the file position for appending
    let position = dbf._headerLength + (dbf.recordCount * dbf._recordLength);
    
    // Buffer for each record
    let buffer = Buffer.alloc(dbf._recordLength);
    
    // Append each record
    for (const record of records) {
      // Clear the buffer
      buffer.fill(0);
      
      // Set the deleted flag (0x20 means not deleted)
      buffer[0] = 0x20;
      
      let offset = 1; // Skip the deleted flag
      
      // Write each field value
      for (const field of dbf.fields) {
        // Get the encoding for this field
        let encoding = typeof dbf._encoding === 'string' ? 
          dbf._encoding : 
          dbf._encoding[field.name] || dbf._encoding.default;
        
        // Get the field value (or null/empty if not provided)
        let value = record[field.name];
        
        // Convert the value based on the field type
        switch (field.type) {
          case 'C': // Character
            {
              const str = value !== null && value !== undefined ? String(value) : '';
              const bytes = iconv.encode(str.padEnd(field.size, ' ').substring(0, field.size), encoding);
              bytes.copy(buffer, offset);
            }
            break;
          case 'N': // Numeric
            {
              if (value === null || value === undefined) {
                buffer.fill(0x20, offset, offset + field.size); // Fill with spaces
              } else {
                let str;
                if (field.decimalPlaces && field.decimalPlaces > 0) {
                  str = value.toFixed(field.decimalPlaces);
                } else {
                  str = Math.round(value).toString();
                }
                const bytes = iconv.encode(str.padStart(field.size, ' ').substring(0, field.size), encoding);
                bytes.copy(buffer, offset);
              }
            }
            break;
          case 'F': // Float
            {
              if (value === null || value === undefined) {
                buffer.fill(0x20, offset, offset + field.size); // Fill with spaces
              } else {
                const str = String(value);
                const bytes = iconv.encode(str.padStart(field.size, ' ').substring(0, field.size), encoding);
                bytes.copy(buffer, offset);
              }
            }
            break;
          case 'L': // Logical
            {
              buffer[offset] = value === true ? 
                0x54 : // 'T'
                value === false ? 
                  0x46 : // 'F'
                  0x20;  // Space for null/undefined
            }
            break;
          case 'D': // Date
            {
              if (value instanceof Date) {
                const year = value.getFullYear();
                const month = value.getMonth() + 1;
                const day = value.getDate();
                const str = 
                  String(year).padStart(4, '0') + 
                  String(month).padStart(2, '0') + 
                  String(day).padStart(2, '0');
                const bytes = iconv.encode(str, encoding);
                bytes.copy(buffer, offset);
              } else {
                buffer.fill(0x20, offset, offset + field.size); // Fill with spaces
              }
            }
            break;
          case '0': // NullFlags or special field
            {
              // For type '0', just fill with zeros or use the provided value if it's a buffer
              if (value instanceof Buffer) {
                // If a Buffer is provided, use it directly (truncating or padding as needed)
                const bytesToCopy = Math.min(value.length, field.size);
                value.copy(buffer, offset, 0, bytesToCopy);
                // Pad with zeros if needed
                if (bytesToCopy < field.size) {
                  buffer.fill(0, offset + bytesToCopy, offset + field.size);
                }
              } else if (typeof value === 'string' && value.startsWith("b'")) {
                // Handle Python-style byte string format like "b'\x00\x01'"
                try {
                  // Parse the byte string by replacing b'...' with actual bytes
                  const byteStr = value.substring(2, value.length - 1)
                    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
                  
                  // Convert to buffer and copy
                  const byteBuffer = Buffer.from(byteStr, 'binary');
                  const bytesToCopy = Math.min(byteBuffer.length, field.size);
                  byteBuffer.copy(buffer, offset, 0, bytesToCopy);
                  
                  // Pad with zeros if needed
                  if (bytesToCopy < field.size) {
                    buffer.fill(0, offset + bytesToCopy, offset + field.size);
                  }
                } catch (e) {
                  // On error, just fill with zeros
                  buffer.fill(0, offset, offset + field.size);
                }
              } else {
                // Default: fill with zeros
                buffer.fill(0, offset, offset + field.size);
              }
            }
            break;
          // Other field types can be added here as needed
          default:
            throw new Error(`Unsupported field type: '${field.type}'`);
        }
        
        // Move to the next field
        offset += field.size;
      }
      
      // Write the record to the file
      await write(fd, buffer, 0, buffer.length, position);
      position += buffer.length;
    }
    
    // Update the record count in the header
    let countBuffer = Buffer.alloc(4);
    countBuffer.writeInt32LE(dbf.recordCount + records.length, 0);
    await write(fd, countBuffer, 0, 4, 4);
    
    // Update the last modified date in the header
    const now = new Date();
    let dateBuffer = Buffer.alloc(3);
    dateBuffer.writeUInt8(now.getFullYear() - 1900, 0);
    dateBuffer.writeUInt8(now.getMonth() + 1, 1);
    dateBuffer.writeUInt8(now.getDate(), 2);
    await write(fd, dateBuffer, 0, 3, 1);
    
    // Write the EOF marker
    let eofBuffer = Buffer.from([0x1A]);
    await write(fd, eofBuffer, 0, 1, position);
    
    // Update the DBF object properties
    dbf.recordCount += records.length;
    dbf.dateOfLastUpdate = now;
    
    return dbf;
  } 
  finally {
    if (fd) await close(fd);
  }
}

function validateRecord(fields, record) {
  for (const field of fields) {
    const value = record[field.name];
    
    // Skip null/undefined values
    if (value === null || value === undefined) continue;
    
    // Validate based on field type
    switch (field.type) {
      case 'C': // Character
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          throw new Error(`Field '${field.name}' must be a string, number, or boolean`);
        }
        break;
      case 'N': // Numeric
      case 'F': // Float
        if (typeof value !== 'number') {
          throw new Error(`Field '${field.name}' must be a number`);
        }
        break;
      case 'L': // Logical
        if (typeof value !== 'boolean') {
          throw new Error(`Field '${field.name}' must be a boolean`);
        }
        break;
      case 'D': // Date
        if (!(value instanceof Date)) {
          throw new Error(`Field '${field.name}' must be a Date`);
        }
        break;
      // Other field types can be added here as needed
    }
  }
}

// Export the DBFFile class and the DELETED symbol
module.exports = {
  DBFFile,
  DELETED
}; 