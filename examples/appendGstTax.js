/**
 * Script to append 5 records with GST_TAX values to TEMPVG.DBF
 */
const { DbfORM } = require('../../src/DbfORM');
const path = require('path');

async function appendGstTaxToTempVG() {
  // Path to the TEMPVG.DBF file
  const dbfPath = path.join(__dirname, 'dbf', 'TEMPVG.DBF');
  
  // Create a new DbfORM instance
  const orm = new DbfORM(dbfPath);
  
  try {
    // Open the DBF file
    await orm.open();
    console.log(`Successfully opened ${dbfPath}`);
    
    // GST_TAX values to append: 100, 120, 140, 150, 180
    const gstTaxValues = [100, 120, 140, 150, 180];
    
    // Get all fields from the DBF file
    const fields = orm.getFields();
    console.log('Fields in TEMPVG.DBF:');
    fields.forEach(field => {
      console.log(`- ${field.name}: Type=${field.type}, Size=${field.size}`);
    });
    
    // Verify the GST_TAX field exists
    if (!orm.hasField('GST_TAX')) {
      throw new Error('GST_TAX field not found in TEMPVG.DBF');
    }
    
    // Create 5 records with the specified GST_TAX values
    const recordsToAppend = gstTaxValues.map(value => {
      // Create a record with just the GST_TAX field
      // For other fields, we'll use default values
      const record = {};
      
      // For each field in the DBF, set a value
      fields.forEach(field => {
        if (field.name === 'GST_TAX') {
          // Ensure this is a number
          record[field.name] = Number(value);
          console.log(`Setting GST_TAX to ${record[field.name]} (type: ${typeof record[field.name]})`);
        } else if (field.name === '_NullFlags') {
          // For _NullFlags, create a buffer filled with zeros
          record[field.name] = Buffer.alloc(field.size, 0);
        } else if (field.name === 'C_CODE') {
          // For C_CODE, use a simple string
          record[field.name] = `G${value}`; // Use a different code for each record
        } else {
          // Set appropriate default values based on field type
          switch (field.type) {
            case 'C': record[field.name] = ''; break;            // Character
            case 'N': case 'F': record[field.name] = 0; break;   // Numeric/Float
            case 'L': record[field.name] = false; break;         // Logical
            case 'D': record[field.name] = null; break;          // Date
            default: record[field.name] = null;
          }
        }
      });
      
      return record;
    });
    
    // Append the records
    await orm.insertMany(recordsToAppend);
    console.log(`Successfully appended 5 records with GST_TAX values: ${gstTaxValues.join(', ')}`);
    
    // Read all records to verify
    const allRecords = await orm.findAll();
    console.log(`TEMPVG.DBF now contains ${allRecords.length} records`);
    
    // Display the last 5 records for verification
    if (allRecords.length >= 5) {
      console.log('Last 5 records:');
      const lastRecords = allRecords.slice(allRecords.length - 5);
      lastRecords.forEach((record, i) => {
        console.log(`Record ${allRecords.length - 5 + i + 1}:`);
        console.log(`  GST_TAX = ${record.GST_TAX} (${typeof record.GST_TAX})`);
        console.log(`  _NullFlags = ${JSON.stringify(record._NullFlags)}`);
        console.log(`  C_CODE = ${record.C_CODE} (${typeof record.C_CODE})`);
      });
    } else if (allRecords.length > 0) {
      console.log('Last record:', JSON.stringify(allRecords[allRecords.length - 1], null, 2));
    }
    
    // Close the file
    orm.close();
    console.log('Operation completed successfully');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the script if this file is executed directly
if (require.main === module) {
  appendGstTaxToTempVG().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
} 