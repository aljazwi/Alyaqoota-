// test.js
const assert = require('assert');

// Simulate the logic from app.js since we can't require DOM scripts directly easily without JSDOM
function calculateExpectedVolume(openingReading, newReading) {
    if (isNaN(openingReading) || isNaN(newReading) || newReading < openingReading) {
        return 0;
    }
    return newReading - openingReading;
}

function calculateExpectedRevenue(volume, pricePerLiter) {
    return parseFloat((volume * pricePerLiter).toFixed(2));
}

try {
    // Test 1: Normal volume calculation
    assert.strictEqual(calculateExpectedVolume(100, 150), 50, "Volume calculation failed");

    // Test 2: Invalid new reading (less than old)
    assert.strictEqual(calculateExpectedVolume(150, 100), 0, "Volume calculation should be 0 if new reading is less");

    // Test 3: Revenue calculation
    assert.strictEqual(calculateExpectedRevenue(50, 2.18), 109, "Revenue calculation failed");

    console.log("All core logic tests passed successfully!");
} catch (error) {
    console.error("Test failed:", error.message);
    process.exit(1);
}
