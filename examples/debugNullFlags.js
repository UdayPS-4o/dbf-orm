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
    
    // Read the last 5 records
    const allRecords = await dbf.readRecords(dbf.recordCount);
    const lastRecords = allRecords.slice(allRecords.length - 5);
    
    // Display field info
    console.log('\nField information:');
    dbf.fields.forEach(field => {
      console.log(`- ${field.name}: Type=${field.type}, Size=${field.size}, Decimal=${field.decimalPlaces}`);
    });
    
    // Open file for direct byte reading
    const fd = fs.openSync(dbfPath, 'r');
    const headerLength = dbf._headerLength;
    const recordLength = dbf._recordLength;
    
    // Find the _NullFlags field position
    let nullFlagsFieldOffset = 1; // Start after deleted flag
    let nullFlagsFieldSize = 0;
    let gstTaxFieldOffset = 1;
    let gstTaxFieldSize = 0;
    
    for (const field of dbf.fields) {
      if (field.name === '_NullFlags') {
        nullFlagsFieldSize = field.size;
        break;
      }
      nullFlagsFieldOffset += field.size;
    }
    
    for (const field of dbf.fields) {
      if (field.name === 'GST_TAX') {
        gstTaxFieldSize = field.size;
        break;
      }
      gstTaxFieldOffset += field.size;
    }
    
    console.log('\nExamining the last 5 records:');
    for (let i = 0; i < 5; i++) {
      const recordIndex = allRecords.length - 5 + i;
      const recordPosition = headerLength + (recordIndex * recordLength);
      
      // Read the raw bytes for _NullFlags
      const nullFlagsBuffer = Buffer.alloc(nullFlagsFieldSize);
      fs.readSync(fd, nullFlagsBuffer, 0, nullFlagsFieldSize, recordPosition + nullFlagsFieldOffset);
      
      // Read the raw bytes for GST_TAX
      const gstTaxBuffer = Buffer.alloc(gstTaxFieldSize);
      fs.readSync(fd, gstTaxBuffer, 0, gstTaxFieldSize, recordPosition + gstTaxFieldOffset);
      
      console.log(`\nRecord ${recordIndex + 1}:`);
      console.log(`  Raw GST_TAX bytes: ${gstTaxBuffer.toString('hex')}`);
      console.log(`  Raw GST_TAX as ascii: '${gstTaxBuffer.toString('ascii')}'`);
      console.log(`  JavaScript value: ${lastRecords[i].GST_TAX} (${typeof lastRecords[i].GST_TAX})`);
      console.log(`  Raw _NullFlags bytes: ${nullFlagsBuffer.toString('hex')}`);
      console.log(`  JavaScript value: ${lastRecords[i]._NullFlags}`);
      
      // Format _NullFlags as byte string for comparison
      const byteStr = "b'" + Array.from(nullFlagsBuffer)
        .map(b => '\\x' + b.toString(16).padStart(2, '0'))
        .join('') + "'";
      
      console.log(`  _NullFlags as byte string: ${byteStr}`);
    }
    
    // Close file
    fs.closeSync(fd);
    
    console.log('\nDBF file closed');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();