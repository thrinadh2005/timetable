import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Dynamic API Base URL depending on environment (Web vs Android Emulator vs Physical Device)
const DEFAULT_HOST = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
export const API_BASE_URL = `${DEFAULT_HOST}/api/v1`;

const TOKEN_KEY = 'gmritdu_auth_token';
const USER_KEY = 'gmritdu_user_data';

export const ApiService = {
  token: null,
  user: null,

  async init() {
    try {
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const storedUser = await AsyncStorage.getItem(USER_KEY);
      if (storedToken) this.token = storedToken;
      if (storedUser) this.user = JSON.parse(storedUser);
    } catch (e) {
      console.warn('Failed to load session from storage:', e);
    }
  },

  async login(identifier, password) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Login failed');
    }
    this.token = data.data.token;
    this.user = data.data.user;
    await AsyncStorage.setItem(TOKEN_KEY, this.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(this.user));
    return data.data;
  },

  async logout() {
    this.token = null;
    this.user = null;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  },

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  },

  async getDepartments() {
    const res = await fetch(`${API_BASE_URL}/departments`, { headers: this.getHeaders() });
    const json = await res.json();
    return json.success ? json.data : [];
  },

  async getTimetableGrid(dept = 'CSE', sem = 'SEM_3', sec = 'A') {
    const query = new URLSearchParams({ department: dept, semester: sem, section: sec }).toString();
    const res = await fetch(`${API_BASE_URL}/timetables/section?${query}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    return json.success ? json.data : null;
  },

  async getLaboratories() {
    const res = await fetch(`${API_BASE_URL}/laboratories`, { headers: this.getHeaders() });
    const json = await res.json();
    return json.success ? json.data : [];
  },

  async getPendingLabRequests() {
    const res = await fetch(`${API_BASE_URL}/laboratories/pending-requests`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    return json.success ? json.data : [];
  },

  async approveOrRejectLabBooking(bookingId, action) {
    const res = await fetch(`${API_BASE_URL}/laboratories/bookings/${bookingId}/approval`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Approval action failed');
    return json.data;
  },

  async createLabBooking(bookingData) {
    const { lab_id, ...body } = bookingData;
    const res = await fetch(`${API_BASE_URL}/laboratories/${encodeURIComponent(lab_id)}/bookings`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Lab booking request failed');
    return json.data;
  },

  async getPendingSubstitutions() {
    const res = await fetch(`${API_BASE_URL}/substitutions/pending`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    return json.success ? json.data : [];
  },

  async approveOrRejectSubstitution(substitutionId, status) {
    const res = await fetch(`${API_BASE_URL}/substitutions/${substitutionId}/status`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Substitution update failed');
    return json.data;
  },

  async requestSubstitution(subData) {
    const res = await fetch(`${API_BASE_URL}/substitutions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(subData),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Substitution request failed');
    return json.data;
  },

  async getAvailability(day = 'MONDAY', period = '1', type = 'ALL', status = 'ALL') {
    const query = new URLSearchParams({ day, period, type, status }).toString();
    const res = await fetch(`${API_BASE_URL}/availability?${query}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    return json.success ? json.data : null;
  },

  async getStaff(departmentId = 'CSE') {
    const res = await fetch(`${API_BASE_URL}/staff?department=${departmentId}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    return json.success ? json.data : [];
  },

  async getEvents(type = 'ALL') {
    const res = await fetch(`${API_BASE_URL}/events?type=${type}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    return json.success ? json.data : [];
  },

  async submitFeedback(feedbackData) {
    const res = await fetch(`${API_BASE_URL}/feedback`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(feedbackData),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Feedback submission failed');
    return json.data;
  },
};

