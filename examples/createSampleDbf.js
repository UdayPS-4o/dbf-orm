/**
 * Script to create a sample DBF file for testing
 */
const { DbfORM } = require('../../src/DbfORM');
const path = require('path');

async function createSampleDbf() {
  // Path to the sample DBF file
  const dbfPath = path.join(__dirname, 'dbf', 'SAMPLE.DBF');
  
  // Create a new DbfORM instance
  const orm = new DbfORM(dbfPath);
  
  try {
    // Define the fields
    orm.defineFields([
      { name: 'ID', type: 'N', size: 5 },
      { name: 'NAME', type: 'C', size: 30 },
      { name: 'ACTIVE', type: 'L', size: 1 },
      { name: 'AMOUNT', type: 'N', size: 10, decimalPlaces: 2 },
      { name: '_NullFlags', type: '0', size: 1 }
    ]);
    
    // Create the file
    await orm.create();
    console.log(`Successfully created ${dbfPath}`);
    
    // Prepare some sample records
    const records = [
      { ID: 1, NAME: 'Sample Record 1', ACTIVE: true, AMOUNT: 123.45, _NullFlags: Buffer.alloc(1, 0) },
      { ID: 2, NAME: 'Sample Record 2', ACTIVE: false, AMOUNT: 678.90, _NullFlags: Buffer.alloc(1, 0) },
      { ID: 3, NAME: 'Sample Record 3', ACTIVE: true, AMOUNT: 1000.00, _NullFlags: Buffer.alloc(1, 0) },
      { ID: 4, NAME: 'Sample Record 4', ACTIVE: false, AMOUNT: 9999.99, _NullFlags: Buffer.alloc(1, 0) },
      { ID: 5, NAME: 'Sample Record 5', ACTIVE: true, AMOUNT: 500.00, _NullFlags: Buffer.alloc(1, 0) }
    ];
    
    // Insert the sample records
    await orm.insertMany(records);
    console.log(`Added ${records.length} sample records`);
    
    // Read back all records to verify
    const allRecords = await orm.findAll();
    console.log(`SAMPLE.DBF contains ${allRecords.length} records:`);
    
    // Display the records
    allRecords.forEach((record, i) => {
      console.log(`Record ${i+1}:`);
      console.log(`  ID = ${record.ID}`);
      console.log(`  NAME = ${record.NAME}`);
      console.log(`  ACTIVE = ${record.ACTIVE}`);
      console.log(`  AMOUNT = ${record.AMOUNT}`);
      console.log(`  _NullFlags = ${JSON.stringify(record._NullFlags)}`);
    });
    
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
  createSampleDbf().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
} 