/**
 * Field descriptor definition and validation for DBF files
 */

/**
 * Validates a field descriptor
 * @param {Object} field - The field descriptor to validate
 * @param {number} fileVersion - The DBF file version
 */
function validateFieldDescriptor(field, fileVersion) {
  const { name, type, size, decimalPlaces: decs } = field;
  
  // name
  if (typeof name !== 'string')
    throw new Error('Name must be a string');
  if (name.length < 1)
    throw new Error(`Field name '${name}' is too short (minimum is 1 char)`);
  if (name.length > 10)
    throw new Error(`Field name '${name}' is too long (maximum is 10 chars)`);
  
  // type
  if (typeof type !== 'string' || type.length !== 1)
    throw new Error('Type must be a single character');
  if (FieldTypes.indexOf(type) === -1)
    throw new Error(`Type '${type}' is not supported`);
  
  // size
  const memoSize = fileVersion == 0x30 ? 4 : 10;
  if (typeof size !== 'number')
    throw new Error('Size must be a number');
  if (size < 1)
    throw new Error('Field size is too small (minimum is 1)');
  if (type === 'C' && size > 255)
    throw new Error('Field size is too large (maximum is 255)');
  if (type === 'N' && size > 20)
    throw new Error('Field size is too large (maximum is 20)');
  if (type === 'F' && size > 20)
    throw new Error('Field size is too large (maximum is 20)');
  if (type === 'Y' && size !== 8)
    throw new Error('Invalid field size (must be 8)');
  if (type === 'L' && size !== 1)
    throw new Error('Invalid field size (must be 1)');
  if (type === 'D' && size !== 8)
    throw new Error('Invalid field size (must be 8)');
  if (type === 'M' && size !== memoSize)
    throw new Error(`Invalid field size (must be ${memoSize})`);
  if (type === 'T' && size !== 8)
    throw new Error('Invalid field size (must be 8)');
  if (type === 'B' && size !== 8)
    throw new Error('Invalid field size (must be 8)');
  if (type === '0')
    return; // Accept any size for type '0' fields
  
  // decimalPlaces
  const maxDecimals = fileVersion === 0x8b ? 18 : 15;
  if (decs !== undefined && typeof decs !== 'number')
    throw new Error('decimalPlaces must be undefined or a number');
  if (decs && decs > maxDecimals)
    throw new Error('Decimal count is too large (maximum is 15)');
}

// Supported field types
const FieldTypes = ['C', 'N', 'F', 'Y', 'L', 'D', 'I', 'M', 'T', 'B', '0'];

module.exports = {
  validateFieldDescriptor
}; 