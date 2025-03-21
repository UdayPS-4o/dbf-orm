/**
 * DBF file version utilities
 */

// Supported DBF file versions
const SupportedFileVersions = [0x03, 0x83, 0x8b, 0x30, 0xf5];

/**
 * Checks if a file version is valid/supported
 * @param {number} version - The file version to check
 * @returns {boolean} - True if the version is supported, false otherwise
 */
function isValidFileVersion(version) {
  return SupportedFileVersions.indexOf(version) >= 0;
}

module.exports = {
  isValidFileVersion,
  SupportedFileVersions
}; 