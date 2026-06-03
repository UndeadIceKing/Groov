import AsyncStorage from '@react-native-async-storage/async-storage';

export async function saveData(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('saveData failed:', key, e);
  }
}

export async function loadData(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('loadData failed:', key, e);
    return null;
  }
}

export async function clearData(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.warn('clearData failed:', key, e);
  }
}

export async function clearAll() {
  try {
    await AsyncStorage.clear();
  } catch (e) {
    console.warn('clearAll failed:', e);
  }
}
