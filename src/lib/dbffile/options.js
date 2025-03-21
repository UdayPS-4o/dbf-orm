/**
 * Options handling for DBF file operations
 */

/**
 * Validates and normalizes open options
 * @param {Object} options - The options to normalize
 * @returns {Object} - Normalized options with defaults
 */
function normaliseOpenOptions(options) {
  const opts = options || {};
  
  // Validate readMode
  if (opts.readMode !== undefined && opts.readMode !== 'strict' && opts.readMode !== 'loose') {
    throw new Error(`Invalid readMode option: '${opts.readMode}'. Valid options are 'strict' or 'loose'.`);
  }
  
  // Validate encoding
  if (opts.encoding !== undefined) {
    if (typeof opts.encoding === 'string') {
      // String encoding is fine
    } else if (typeof opts.encoding === 'object' && opts.encoding !== null) {
      if (typeof opts.encoding.default !== 'string') {
        throw new Error(`Invalid encoding option: missing required 'default' property.`);
      }
      for (const key of Object.keys(opts.encoding)) {
        if (typeof opts.encoding[key] !== 'string') {
          throw new Error(`Invalid encoding option: property '${key}' must be a string.`);
        }
      }
    } else {
      throw new Error(`Invalid encoding option: must be a string or an object with string values.`);
    }
  }
  
  // Create a new options object with defaults
  return {
    readMode: opts.readMode || 'strict',
    encoding: opts.encoding || 'utf8',
    includeDeletedRecords: !!opts.includeDeletedRecords
  };
}

/**
 * Validates and normalizes create options
 * @param {Object} options - The options to normalize
 * @returns {Object} - Normalized options with defaults
 */
function normaliseCreateOptions(options) {
  const opts = options || {};
  
  // Validate fileVersion
  if (opts.fileVersion !== undefined && 
      [0x03, 0x83, 0x8b, 0x30].indexOf(opts.fileVersion) === -1) {
    throw new Error(`Invalid fileVersion option: '${opts.fileVersion}'.`);
  }
  
  // Validate encoding (same as for open options)
  if (opts.encoding !== undefined) {
    if (typeof opts.encoding === 'string') {
      // String encoding is fine
    } else if (typeof opts.encoding === 'object' && opts.encoding !== null) {
      if (typeof opts.encoding.default !== 'string') {
        throw new Error(`Invalid encoding option: missing required 'default' property.`);
      }
      for (const key of Object.keys(opts.encoding)) {
        if (typeof opts.encoding[key] !== 'string') {
          throw new Error(`Invalid encoding option: property '${key}' must be a string.`);
        }
      }
    } else {
      throw new Error(`Invalid encoding option: must be a string or an object with string values.`);
    }
  }
  
  // Create a new options object with defaults
  return {
    fileVersion: opts.fileVersion || 0x03,
    encoding: opts.encoding || 'utf8'
  };
}

module.exports = {
  normaliseOpenOptions,
  normaliseCreateOptions
}; 