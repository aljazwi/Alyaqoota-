// db.js
const DB_NAME = "StationAppDB";
const DB_VERSION = 2;

let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Database error: ", event.target.errorCode);
            reject("Error opening database");
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            // 1. pumps (المضخات)
            if (!db.objectStoreNames.contains('pumps')) {
                const pumpsStore = db.createObjectStore('pumps', { keyPath: 'id' });
                // id: 'P1', type: 'gasoline', price: 0.0, status: 'active', operator: null, current_reading: 0, old_reading: 0, is_setup: false
                const initialPumps = [
                    ...Array.from({length: 8}, (_, i) => ({ id: `P${i+1}`, type: 'gasoline', price: 0, status: 'active', current_reading: 0, old_reading: 0, is_setup: false })),
                    ...Array.from({length: 4}, (_, i) => ({ id: `D${i+1}`, type: 'diesel', price: 0, status: 'active', current_reading: 0, old_reading: 0, is_setup: false }))
                ];
                initialPumps.forEach(pump => pumpsStore.add(pump));
            }

            // 2. tanks (الخزانات)
            if (!db.objectStoreNames.contains('tanks')) {
                const tanksStore = db.createObjectStore('tanks', { keyPath: 'id' });
                const initialTanks = [
                    ...Array.from({length: 6}, (_, i) => ({ id: `C-P${i+1}`, type: 'gasoline', capacity: 20000, current_volume: 20000 })),
                    ...Array.from({length: 4}, (_, i) => ({ id: `C-D${i+1}`, type: 'diesel', capacity: 20000, current_volume: 20000 }))
                ];
                initialTanks.forEach(tank => tanksStore.add(tank));
            }

            // 3. shifts (الورديات)
            if (!db.objectStoreNames.contains('shifts')) {
                db.createObjectStore('shifts', { keyPath: 'id', autoIncrement: true });
                // id, timestamp_open, timestamp_close, status: 'open'|'closed', operator, etc.
            }

            // 4. shift_readings (قراءات الورديات)
            if (!db.objectStoreNames.contains('shift_readings')) {
                const shiftReadingsStore = db.createObjectStore('shift_readings', { keyPath: 'id', autoIncrement: true });
                shiftReadingsStore.createIndex('shift_id', 'shift_id', { unique: false });
                shiftReadingsStore.createIndex('pump_id', 'pump_id', { unique: false });
                // shift_id, pump_id, opening_reading, closing_reading, expected_revenue, actual_revenue, discount, volume_variance, cash_variance
            }

            // 5. group_closures (الإغلاقات الجماعية)
            if (!db.objectStoreNames.contains('group_closures')) {
                db.createObjectStore('group_closures', { keyPath: 'id', autoIncrement: true });
                // shift_id, total_expected, total_actual, total_cash_variance, total_volume_variance, timestamp, operator
            }

            // 6. other_incomes (إيرادات أخرى)
            if (!db.objectStoreNames.contains('other_incomes')) {
                db.createObjectStore('other_incomes', { keyPath: 'id', autoIncrement: true });
                // date, type (rent, service, etc.), amount, description
            }

            // 7. expenses (المصروفات)
            if (!db.objectStoreNames.contains('expenses')) {
                db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
                // date, type (electricity, salary, etc.), amount, description
            }

            // 8. daily_ledger (دفتر الأستاذ اليومي)
            if (!db.objectStoreNames.contains('daily_ledger')) {
                db.createObjectStore('daily_ledger', { keyPath: 'id', autoIncrement: true });
                // date, entry_type (debit/credit), amount, category, reference_id, timestamp
            }

            // 9. audit_log (سجل التدقيق)
            if (!db.objectStoreNames.contains('audit_log')) {
                db.createObjectStore('audit_log', { keyPath: 'id', autoIncrement: true });
                // table_name, record_id, action, old_data, new_data, user, timestamp
            }

            // 10. settings (الإعدادات)
            if (!db.objectStoreNames.contains('settings')) {
                const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
                settingsStore.add({ key: 'gasoline_buy_price', value: 2.00 });
                settingsStore.add({ key: 'gasoline_sell_price', value: 2.18 });
                settingsStore.add({ key: 'diesel_buy_price', value: 2.50 });
                settingsStore.add({ key: 'diesel_sell_price', value: 2.90 });
                settingsStore.add({ key: 'variance_limit_percent', value: 0.5 });
            } else {
                // Handle upgrade from V1 to V2
                if (event.oldVersion < 2) {
                    const reqStore = request.transaction.objectStore('settings');
                    reqStore.delete('gasoline_price');
                    reqStore.delete('diesel_price');

                    reqStore.put({ key: 'gasoline_buy_price', value: 2.00 });
                    reqStore.put({ key: 'gasoline_sell_price', value: 2.18 });
                    reqStore.put({ key: 'diesel_buy_price', value: 2.50 });
                    reqStore.put({ key: 'diesel_sell_price', value: 2.90 });
                }
            }
        };
    });
}

// Helpers for IndexedDB transactions
function getStore(storeName, mode = 'readonly') {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
}

function getAllData(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getData(storeName, key) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function putData(storeName, data) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.put(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function addData(storeName, data) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Audit log helper
async function logAudit(tableName, recordId, action, oldData, newData, user) {
    const logEntry = {
        table_name: tableName,
        record_id: recordId,
        action: action,
        old_data: oldData,
        new_data: newData,
        user: user,
        timestamp: new Date().toISOString()
    };
    await addData('audit_log', logEntry);
}
