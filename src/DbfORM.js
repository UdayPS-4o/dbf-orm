/**
 * DbfORM - A fully-featured ORM for DBF files
 * 
 * This ORM provides convenient methods for:
 * - Creating, opening, and managing DBF files
 * - Defining and validating field schemas
 * - Reading, writing, and appending records
 * - Performing CRUD operations
 * - Query functionality with filtering
 */

// Using our custom dbffile implementation instead of the npm package
const { DBFFile, DELETED } = require('./lib/dbffile/dbf-file');
const path = require('path');
const fs = require('fs');

class DbfORM {
  /**
   * Create a new DbfORM instance
   * @param {string} dbfPath - Path to the DBF file (optional)
   * @param {Object} options - Options for the ORM
   * @param {boolean} options.autoCreate - Automatically create the file if it doesn't exist (default: false)
   * @param {string} options.encoding - Character encoding for the DBF file (default: 'utf8')
   * @param {boolean} options.includeDeletedRecords - Include deleted records when reading (default: false)
   * @param {string} options.readMode - Read mode: 'strict' or 'loose' (default: 'strict')
   */
  constructor(dbfPath, options = {}) {
    this.dbfPath = dbfPath;
    this.options = {
      autoCreate: options.autoCreate || false,
      encoding: options.encoding || 'utf8',
      includeDeletedRecords: options.includeDeletedRecords || false,
      readMode: options.readMode || 'strict'
    };
    this.dbfFile = null;
    this.isOpen = false;
    this.fieldDescriptors = [];
  }

  /**
   * Define a field schema for the DBF file
   * @param {Array} fieldDescriptors - Array of field descriptors
   * @returns {DbfORM} - Returns this instance for chaining
   */
  defineFields(fieldDescriptors) {
    this.fieldDescriptors = fieldDescriptors.map(field => {
      // Validate field
      if (!field.name || !field.type) {
        throw new Error(`Field must have name and type properties`);
      }
      
      // Ensure field name is max 10 chars
      if (field.name.length > 10) {
        throw new Error(`Field name '${field.name}' exceeds maximum length of 10 characters`);
      }
      
      // Set default size if not provided
      if (!field.size) {
        switch (field.type) {
          case 'C': field.size = 254; break;  // Character
          case 'N': field.size = 15; break;   // Numeric
          case 'F': field.size = 15; break;   // Float
          case 'L': field.size = 1; break;    // Logical
          case 'D': field.size = 8; break;    // Date
          case 'M': field.size = 10; break;   // Memo
          default: field.size = 10;
        }
      }
      
      return field;
    });
    
    return this;
  }

  /**
   * Open a DBF file, or create it if it doesn't exist and autoCreate is enabled
   * @returns {Promise<DbfORM>} - Promise resolving to this instance
   */
  async open() {
    try {
      // Try to open the existing file
      this.dbfFile = await DBFFile.open(this.dbfPath, {
        encoding: this.options.encoding,
        includeDeletedRecords: this.options.includeDeletedRecords,
        readMode: this.options.readMode
      });
      
      // If we opened the file, update our field descriptors from the file
      this.fieldDescriptors = this.dbfFile.fields;
      this.isOpen = true;
      return this;
    } catch (error) {
      // If the file doesn't exist and autoCreate is enabled, create it
      if (error.code === 'ENOENT' && this.options.autoCreate) {
        if (this.fieldDescriptors.length === 0) {
          throw new Error('Cannot create DBF file: no field descriptors defined. Use defineFields() first.');
        }
        
        // Create the directory if it doesn't exist
        const dir = path.dirname(this.dbfPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // Create the DBF file
        this.dbfFile = await DBFFile.create(this.dbfPath, this.fieldDescriptors, {
          encoding: this.options.encoding
        });
        
        this.isOpen = true;
        return this;
      }
      
      // Otherwise, rethrow the error
      throw error;
    }
  }

  /**
   * Create a new DBF file with the defined schema
   * @param {string} filePath - Path to create the file at (optional, uses this.dbfPath if not provided)
   * @returns {Promise<DbfORM>} - Promise resolving to this instance
   */
  async create(filePath = null) {
    if (this.fieldDescriptors.length === 0) {
      throw new Error('Cannot create DBF file: no field descriptors defined. Use defineFields() first.');
    }
    
    const targetPath = filePath || this.dbfPath;
    
    // Create the directory if it doesn't exist
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Create the DBF file
    this.dbfFile = await DBFFile.create(targetPath, this.fieldDescriptors, {
      encoding: this.options.encoding
    });
    
    this.isOpen = true;
    this.dbfPath = targetPath;
    
    return this;
  }

  /**
   * Ensure the DBF file is open, opening it if needed
   * @returns {Promise<void>}
   */
  async ensureOpen() {
    if (!this.isOpen) {
      await this.open();
    }
  }

  /**
   * Close the DBF file
   */
  close() {
    this.dbfFile = null;
    this.isOpen = false;
  }

  /**
   * Get all records from the DBF file
   * @returns {Promise<Array>} - Promise resolving to an array of records
   */
  async findAll() {
    await this.ensureOpen();
    return await this.dbfFile.readRecords();
  }

  /**
   * Find records matching a filter function
   * @param {Function} filterFn - Function that takes a record and returns true if it should be included
   * @returns {Promise<Array>} - Promise resolving to an array of matching records
   */
  async find(filterFn) {
    await this.ensureOpen();
    const records = await this.dbfFile.readRecords();
    return records.filter(filterFn);
  }

  /**
   * Find records where field values match the criteria
   * @param {Object} criteria - Object with field/value pairs to match
   * @returns {Promise<Array>} - Promise resolving to an array of matching records
   */
  async findWhere(criteria) {
    await this.ensureOpen();
    
    const filterFn = (record) => {
      for (const [field, value] of Object.entries(criteria)) {
        if (record[field] !== value) {
          return false;
        }
      }
      return true;
    };
    
    return this.find(filterFn);
  }

  /**
   * Find the first record matching a filter function
   * @param {Function} filterFn - Function that takes a record and returns true if it matches
   * @returns {Promise<Object|null>} - Promise resolving to the first matching record or null
   */
  async findOne(filterFn) {
    await this.ensureOpen();
    
    for await (const record of this.dbfFile) {
      if (filterFn(record)) {
        return record;
      }
    }
    
    return null;
  }

  /**
   * Find the first record where field values match the criteria
   * @param {Object} criteria - Object with field/value pairs to match
   * @returns {Promise<Object|null>} - Promise resolving to the first matching record or null
   */
  async findOneWhere(criteria) {
    const filterFn = (record) => {
      for (const [field, value] of Object.entries(criteria)) {
        if (record[field] !== value) {
          return false;
        }
      }
      return true;
    };
    
    return this.findOne(filterFn);
  }

  /**
   * Insert a single record into the DBF file
   * @param {Object} record - The record to insert
   * @returns {Promise<DbfORM>} - Promise resolving to this instance
   */
  async insert(record) {
    await this.ensureOpen();
    await this.dbfFile.appendRecords([record]);
    return this;
  }

  /**
   * Insert multiple records into the DBF file
   * @param {Array} records - Array of records to insert
   * @returns {Promise<DbfORM>} - Promise resolving to this instance
   */
  async insertMany(records) {
    await this.ensureOpen();
    await this.dbfFile.appendRecords(records);
    return this;
  }

  /**
   * Get information about the DBF file
   * @returns {Object} - Object containing information about the DBF file
   */
  getInfo() {
    if (!this.isOpen) {
      throw new Error('DBF file is not open');
    }
    
    return {
      path: this.dbfFile.path,
      recordCount: this.dbfFile.recordCount,
      dateOfLastUpdate: this.dbfFile.dateOfLastUpdate,
      fields: this.dbfFile.fields,
    };
  }

  /**
   * Get field descriptors for the DBF file
   * @returns {Array} - Array of field descriptors
   */
  getFields() {
    if (!this.isOpen) {
      throw new Error('DBF file is not open');
    }
    
    return this.dbfFile.fields;
  }

  /**
   * Check if a field exists in the DBF file
   * @param {string} fieldName - Name of the field to check
   * @returns {boolean} - True if the field exists, false otherwise
   */
  hasField(fieldName) {
    if (!this.isOpen) {
      throw new Error('DBF file is not open');
    }
    
    return this.dbfFile.fields.some(field => field.name === fieldName);
  }

  /**
   * Export DBF file contents to JSON
   * @param {string} outputPath - Path to save the JSON file (optional)
   * @returns {Promise<Object[]>} - Promise resolving to an array of records as JSON objects
   */
  async toJSON(outputPath = null) {
    await this.ensureOpen();
    
    try {
      // Read all records from the DBF file
      const records = await this.dbfFile.readRecords();
      
      // If an output path is provided, save the JSON to a file
      if (outputPath) {
        const jsonString = JSON.stringify(records, null, 2);
        fs.writeFileSync(outputPath, jsonString, 'utf8');
        console.log(`DBF data exported to JSON file: ${outputPath}`);
      }
      
      return records;
    } catch (error) {
      console.error('Error exporting DBF to JSON:', error);
      throw error;
    }
  }

  /**
   * Append records from a JSON array to the DBF file
   * @param {Array|string} jsonData - Array of record objects or path to a JSON file
   * @param {Object} options - Options for appending
   * @param {boolean} options.validateFields - Validate fields before appending (default: true)
   * @param {boolean} options.fillMissing - Fill missing fields with default values (default: true)
   * @returns {Promise<{success: boolean, message: string, count: number}>} - Result object with status and count
   */
  async appendFromJSON(jsonData, options = {}) {
    const defaultOptions = {
      validateFields: true,
      fillMissing: true
    };
    
    const opts = { ...defaultOptions, ...options };
    let records;
    
    try {
      // If jsonData is a string, assume it's a file path
      if (typeof jsonData === 'string') {
        try {
          const fileData = fs.readFileSync(jsonData, 'utf8');
          records = JSON.parse(fileData);
          if (!Array.isArray(records)) {
            throw new Error('JSON file does not contain an array of records');
          }
        } catch (fileError) {
          return {
            success: false,
            message: `Error reading JSON file: ${fileError.message}`,
            count: 0
          };
        }
      } else if (Array.isArray(jsonData)) {
        records = jsonData;
      } else {
        return {
          success: false,
          message: 'Input must be an array of records or a path to a JSON file',
          count: 0
        };
      }
      
      // If no records to append, return early
      if (records.length === 0) {
        return {
          success: true,
          message: 'No records to append',
          count: 0
        };
      }
      
      // Ensure the file is open
      await this.ensureOpen();
      
      // Get the field information
      const fields = this.getFields();
      
      // Process and validate records
      const processedRecords = records.map(record => {
        const processedRecord = {};
        
        // Process each field
        fields.forEach(field => {
          const fieldName = field.name;
          
          if (record.hasOwnProperty(fieldName)) {
            // Record has this field, use its value
            processedRecord[fieldName] = record[fieldName];
          } else if (opts.fillMissing) {
            // Record doesn't have this field, use default value
            switch (field.type) {
              case 'C': processedRecord[fieldName] = ''; break;         // Character
              case 'N': case 'F': processedRecord[fieldName] = 0; break; // Numeric/Float
              case 'L': processedRecord[fieldName] = false; break;      // Logical
              case 'D': processedRecord[fieldName] = null; break;       // Date
              case '0': // NullFlags field
                if (fieldName === '_NullFlags') {
                  // For _NullFlags, use a default byte string with all zeros
                  processedRecord[fieldName] = Buffer.alloc(field.size); 
                } else {
                  processedRecord[fieldName] = null;
                }
                break;
              default: processedRecord[fieldName] = null;
            }
          } else if (opts.validateFields) {
            // If we're validating and not filling, this is an error
            throw new Error(`Record is missing required field: ${fieldName}`);
          }
        });
        
        return processedRecord;
      });
      
      // Try to append the records
      try {
        await this.dbfFile.appendRecords(processedRecords);
        
        return {
          success: true,
          message: `Successfully appended ${processedRecords.length} records`,
          count: processedRecords.length
        };
      } catch (appendError) {
        // Check if this is a "file in use" error
        if (appendError.code === 'EBUSY' || 
            appendError.message.includes('in use') || 
            appendError.message.includes('being used') ||
            appendError.message.includes('locked') ||
            appendError.message.includes('access denied')) {
          return {
            success: false,
            message: 'File is currently in use by another process',
            count: 0,
            isLocked: true
          };
        }
        
        // Other error
        throw appendError;
      }
    } catch (error) {
      return {
        success: false,
        message: `Error appending JSON data: ${error.message}`,
        count: 0
      };
    }
  }

  /**
   * Check if the DBF file is locked by another process
   * @returns {Promise<boolean>} - True if the file is locked, false otherwise
   */
  async isLocked() {
    if (!fs.existsSync(this.dbfPath)) {
      return false; // File doesn't exist, so it's not locked
    }
    
    try {
      // Try to open the file for writing
      const fd = fs.openSync(this.dbfPath, 'r+');
      // If successful, close it and return false (not locked)
      fs.closeSync(fd);
      return false;
    } catch (error) {
      // If there's an error opening the file, it might be locked
      if (error.code === 'EBUSY' || 
          error.code === 'EPERM' || 
          error.code === 'EACCES') {
        return true;
      }
      
      // For other errors, the file might exist but have other issues
      return false;
    }
  }
}

// Export both the DbfORM class and the DELETED symbol
module.exports = { 
  DbfORM,
  DELETED
}; 