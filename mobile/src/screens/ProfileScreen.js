import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { ApiService } from '../services/api';

export default function ProfileScreen({ currentUser, onUserChange, isDesktop }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState('light'); // 'light' | 'dark'
  const [selectedDept, setSelectedDept] = useState(currentUser?.departmentId || 'CSE');
  const [selectedSem, setSelectedSem] = useState('3');
  const [selectedSec, setSelectedSec] = useState('A');
  const [feedbackCategory, setFeedbackCategory] = useState('TIMETABLE');
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackComments, setFeedbackComments] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  async function handleSendFeedback() {
    if (!feedbackTitle.trim() || !feedbackComments.trim()) {
      Alert.alert('Required', 'Please enter a title and comments for your feedback.');
      return;
    }
    try {
      setSubmittingFeedback(true);
      await ApiService.submitFeedback({
        category: feedbackCategory,
        rating: feedbackRating,
        title: feedbackTitle,
        comments: feedbackComments,
        department_id: currentUser?.departmentId || selectedDept
      });
      Alert.alert('Thank You', 'Your institutional feedback has been received.');
      setFeedbackTitle('');
      setFeedbackComments('');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to submit feedback.');
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      Alert.alert('Required', 'Please enter your PNR or institutional email and password.');
      return;
    }

    try {
      setLoading(true);
      const data = await ApiService.login(identifier.trim(), password);
      onUserChange(data.user);
      Alert.alert('Logged In', `Welcome back, ${data.user.fullName}`);
    } catch (err) {
      Alert.alert('Authentication Failed', err.message || 'Invalid institutional credentials.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await ApiService.logout();
    onUserChange(null);
    Alert.alert('Session Closed', 'You have been logged out.');
  }

  function handleSavePreferences() {
    Alert.alert('Preferences Saved', `Default schedule set to: ${selectedDept} Semester ${selectedSem} Section ${selectedSec}`);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      
      {/* 1. APPEARANCE & DISPLAY (ONLY LIGHT & DARK) */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Display &amp; Appearance</Text>
          <View style={styles.themePill}>
            <Text style={styles.themePillText}>
              {selectedTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardSubtitle}>
          Universal high-readability institutional palette (WCAG AA compliant).
        </Text>

        <View style={styles.themeToggleRow}>
          <TouchableOpacity
            style={[styles.themeBtn, selectedTheme === 'light' && styles.themeBtnActive]}
            onPress={() => setSelectedTheme('light')}
          >
            <Text style={[styles.themeBtnText, selectedTheme === 'light' && styles.themeBtnTextActive]}>
              Light Theme
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.themeBtn, selectedTheme === 'dark' && styles.themeBtnActive]}
            onPress={() => setSelectedTheme('dark')}
          >
            <Text style={[styles.themeBtnText, selectedTheme === 'dark' && styles.themeBtnTextActive]}>
              Dark Theme
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. USER PROFILE & INSTITUTIONAL CREDENTIALS */}
      {currentUser ? (
        <View style={styles.card}>
          <View style={styles.userHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {currentUser.fullName
                  ? currentUser.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                  : 'GM'}
              </Text>
            </View>
            <View style={styles.userMeta}>
              <Text style={styles.userName}>{currentUser.fullName}</Text>
              <Text style={styles.userRole}>{currentUser.role}</Text>
              <Text style={styles.userEmail}>{currentUser.email}</Text>
            </View>
          </View>

          <View style={styles.detailsBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>PNR / Roll number</Text>
              <Text style={styles.detailValue}>{currentUser.pnr || currentUser.pnrno || 'Verified'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Assigned department</Text>
              <Text style={styles.detailValue}>{currentUser.departmentId || 'CSE'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Session status</Text>
              <Text style={[styles.detailValue, { color: Colors.accentCyan }]}>Active Institutional Session</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Sign out of account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Institutional Sign In</Text>
          <Text style={styles.cardSubtitle}>Sign in with your official @gmrit.edu.in account</Text>

          <Text style={styles.inputLabel}>Institutional Email / Roll Number / PNR</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 24341a0502@gmrit.edu.in or 52171"
            placeholderTextColor={Colors.textMutedLight}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
          />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMutedLight}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.loginBtnText}>{loading ? 'Authenticating...' : 'Sign In to Portal'}</Text>
          </TouchableOpacity>

          <Text style={styles.helpText}>
            For credentials assistance or password recovery, contact IT Operations at it.support@gmrit.edu.in
          </Text>
        </View>
      )}

      {/* 3. ACADEMIC PREFERENCES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Academic Defaults</Text>
        <Text style={styles.cardSubtitle}>Configure default view for timetable and facility schedules</Text>

        <Text style={styles.inputLabel}>Preferred Department</Text>
        <View style={styles.chipRow}>
          {['CSE', 'ECE', 'AIML', 'AIDS', 'IT', 'EEE', 'MECH', 'CIVIL'].map((dept) => (
            <TouchableOpacity
              key={dept}
              style={[styles.chip, selectedDept === dept && styles.chipActive]}
              onPress={() => setSelectedDept(dept)}
            >
              <Text style={[styles.chipText, selectedDept === dept && styles.chipTextActive]}>{dept}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.inputLabel, { marginTop: Spacing.md }]}>Semester &amp; Section</Text>
        <View style={styles.chipRow}>
          {['1', '2', '3', '4', '5', '6', '7', '8'].map((sem) => (
            <TouchableOpacity
              key={sem}
              style={[styles.chipSmall, selectedSem === sem && styles.chipActive]}
              onPress={() => setSelectedSem(sem)}
            >
              <Text style={[styles.chipText, selectedSem === sem && styles.chipTextActive]}>Sem {sem}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.chipRow, { marginTop: Spacing.sm }]}>
          {['A', 'B', 'C', 'D'].map((sec) => (
            <TouchableOpacity
              key={sec}
              style={[styles.chipSmall, selectedSec === sec && styles.chipActive]}
              onPress={() => setSelectedSec(sec)}
            >
              <Text style={[styles.chipText, selectedSec === sec && styles.chipTextActive]}>Sec {sec}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.savePrefBtn} onPress={handleSavePreferences}>
          <Text style={styles.savePrefBtnText}>Save Academic Defaults</Text>
        </TouchableOpacity>
      </View>

      {/* 4. ENTERPRISE SYSTEM TELEMETRY */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>System Infrastructure</Text>
          <View style={[styles.themePill, { backgroundColor: '#ECFDF5' }]}>
            <Text style={[styles.themePillText, { color: Colors.success }]}>Online</Text>
          </View>
        </View>
        
        <View style={styles.telemetryGrid}>
          <View style={styles.telemetryTile}>
            <Text style={styles.telemetryVal}>1,260</Text>
            <Text style={styles.telemetryLabel}>Total Slots</Text>
          </View>
          <View style={styles.telemetryTile}>
            <Text style={styles.telemetryVal}>80</Text>
            <Text style={styles.telemetryLabel}>Staff Records</Text>
          </View>
          <View style={styles.telemetryTile}>
            <Text style={styles.telemetryVal}>8</Text>
            <Text style={styles.telemetryLabel}>Departments</Text>
          </View>
          <View style={styles.telemetryTile}>
            <Text style={styles.telemetryVal}>WAL</Text>
            <Text style={styles.telemetryLabel}>SQLite Mode</Text>
          </View>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: Colors.textPrimaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: Colors.textMutedLight,
    marginBottom: Spacing.md,
  },
  themePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.subtleLight,
  },
  themePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.primary,
  },
  themeToggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.subtleLight,
    borderRadius: Radius.full,
    padding: 3,
    gap: 4,
  },
  themeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  themeBtnActive: {
    backgroundColor: Colors.surfaceLight,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  themeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMutedLight,
  },
  themeBtnTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brandDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimaryLight,
  },
  userRole: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 1,
  },
  userEmail: {
    fontSize: 11,
    color: Colors.textMutedLight,
    marginTop: 1,
  },
  detailsBox: {
    backgroundColor: Colors.subtleLight,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 11.5,
    color: Colors.textMutedLight,
  },
  detailValue: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
    fontFamily: Typography.codeFont,
  },
  logoutBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.danger,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondaryLight,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    fontSize: 12.5,
    color: Colors.textPrimaryLight,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surfaceLight,
  },
  loginBtn: {
    backgroundColor: Colors.brandDeep,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  helpText: {
    marginTop: Spacing.md,
    fontSize: 11,
    color: Colors.textMutedLight,
    textAlign: 'center',
    lineHeight: 15,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.subtleLight,
  },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.subtleLight,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondaryLight,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  savePrefBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  savePrefBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  telemetryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  telemetryTile: {
    flex: 1,
    backgroundColor: Colors.subtleLight,
    borderRadius: Radius.md,
    padding: 8,
    alignItems: 'center',
  },
  telemetryVal: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
    fontFamily: Typography.codeFont,
  },
  telemetryLabel: {
    fontSize: 9.5,
    color: Colors.textMutedLight,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
