const fs = require('fs');
const path = require('path');
const { DBFFile } = require('../../src/lib/dbffile/dbf-file');

async function main() {
  try {
    // Path to the DBF file
    const dbfPath = path.resolve(__dirname, 'dbf', 'TEMPVG.DBF');
    
    // Open the DBF file
    console.log(`Opening ${dbfPath}...`);
    const dbf = await DBFFile.open(dbfPath);
    
    // Get the total number of records
    const recordCount = dbf.recordCount;
    console.log(`Total records: ${recordCount}`);
    
    // Read the last 10 records or all records if less than 10
    const numToRead = Math.min(10, recordCount);
    const startRecord = Math.max(0, recordCount - numToRead);
    
    // Position the record pointer at the start record
    dbf._recordsRead = startRecord;
    
    // Read the records
    const records = await dbf.readRecords(numToRead);
    
    // Display field info
    const fields = dbf.fields;
    console.log('\nField information:');
    fields.forEach(field => {
      console.log(`- ${field.name}: Type=${field.type}, Size=${field.size}, Decimal=${field.decimalPlaces}`);
    });
    
    // Print the records with detailed information
    console.log(`\nLast ${records.length} records (${startRecord+1}-${startRecord+records.length}):`);
    records.forEach((record, i) => {
      console.log(`\nRecord ${startRecord + i + 1}:`);
      for (const field of fields) {
        console.log(`  ${field.name} = ${record[field.name]} (${typeof record[field.name]})`);
      }
    });
    
    // Read raw file data to check bytes
    const fd = fs.openSync(dbfPath, 'r');
    const headerLength = dbf._headerLength;
    const recordLength = dbf._recordLength;
    
    console.log('\nRaw bytes for GST_TAX field in the last record:');
    
    // Find the GST_TAX field position
    let gstTaxFieldOffset = 1; // Start after deleted flag
    let gstTaxFieldSize = 0;
    
    for (const field of fields) {
      if (field.name === 'GST_TAX') {
        gstTaxFieldSize = field.size;
        break;
      }
      gstTaxFieldOffset += field.size;
    }
    
    // Calculate the position of the last record's GST_TAX field
    const lastRecordPos = headerLength + (recordCount - 1) * recordLength;
    const gstTaxFieldPos = lastRecordPos + gstTaxFieldOffset;
    
    // Read the raw bytes
    const buffer = Buffer.alloc(gstTaxFieldSize);
    fs.readSync(fd, buffer, 0, gstTaxFieldSize, gstTaxFieldPos);
    
    // Display the raw bytes
    console.log(`Offset in record: ${gstTaxFieldOffset}, Size: ${gstTaxFieldSize}`);
    console.log(`Raw bytes (hex): ${buffer.toString('hex')}`);
    console.log(`Raw bytes (ascii): '${buffer.toString('ascii')}'`);
    
    // Close file
    fs.closeSync(fd);
    
    // Close the DBF file
    await dbf.close();
    console.log('\nDBF file closed');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 