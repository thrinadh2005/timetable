import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { ApiService } from '../services/api';

const PERIODS = [1, 2, 3, 4, 5, 6, 7];
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export default function LaboratoriesScreen({ currentUser, isDesktop }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Booking Form State
  const [selectedLabId, setSelectedLabId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bookingDate, setBookingDate] = useState('2026-10-14');
  const [dayOfWeek, setDayOfWeek] = useState('WEDNESDAY');
  const [periodIndex, setPeriodIndex] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadLabs();
  }, []);

  async function loadLabs() {
    try {
      setLoading(true);
      const data = await ApiService.getLaboratories();
      setLabs(data || []);
      if (data && data.length > 0 && !selectedLabId) {
        setSelectedLabId(data[0].lab_id);
      }
    } catch (err) {
      console.warn('Failed to load laboratories:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    loadLabs();
  };

  async function handleSubmitBooking() {
    if (!title.trim()) {
      Alert.alert('Required Field', 'Please enter a title or purpose for the booking.');
      return;
    }

    try {
      setSubmitting(true);
      await ApiService.createLabBooking({
        lab_id: selectedLabId,
        title: title.trim(),
        description: description.trim() || 'Laboratory practical session request',
        booking_date: bookingDate,
        day_of_week: dayOfWeek,
        period_index: periodIndex,
        coordinator_name: currentUser?.fullName || 'Student Coordinator',
      });

      Alert.alert(
        'Request Submitted',
        'Your laboratory booking request has been submitted to the HOD for review. The facility is now reserved.'
      );
      setModalVisible(false);
      setTitle('');
      setDescription('');
      loadLabs();
    } catch (err) {
      Alert.alert('Booking Error', err.message || 'Unable to schedule booking. Facility may conflict.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header Strip & Action Button */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.heading}>Laboratory facilities</Text>
          <Text style={styles.subheading}>{labs.length} specialized departmental laboratories</Text>
        </View>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.primaryBtnText}>Request lab</Text>
        </TouchableOpacity>
      </View>

      {/* Laboratories Deck */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={Colors.accentCyan} />
          <Text style={styles.mutedText}>Checking real-time lab occupancy...</Text>
        </View>
      ) : labs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No laboratories found</Text>
        </View>
      ) : (
        <View style={[styles.deck, isDesktop && styles.deckDesktop]}>
          {labs.map((lab) => {
            const hasLiveStatus = !!lab.liveStatus;
            const isAvailable = lab.liveStatus === 'AVAILABLE';
            const isReserved = lab.liveStatus === 'RESERVED' || lab.is_reserved;

            return (
              <View key={lab.lab_id} style={[styles.labCard, isDesktop && styles.labCardDesktop]}>
                <View style={styles.cardHeader}>
                  <View style={styles.titleWrap}>
                    <Text style={styles.labName}>{lab.name}</Text>
                    <Text style={styles.labLocation}>{lab.room_number || lab.location}</Text>
                  </View>
                  {hasLiveStatus ? (
                    <View
                      style={[
                        styles.statusPill,
                        isAvailable ? styles.statusAvailable : isReserved ? styles.statusReserved : styles.statusOccupied,
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          isAvailable ? styles.dotAvailable : isReserved ? styles.dotReserved : styles.dotOccupied,
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusText,
                          isAvailable ? styles.textAvailable : isReserved ? styles.textReserved : styles.textOccupied,
                        ]}
                      >
                        {isReserved ? 'Pending approval' : lab.liveStatus}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.deptPill}>
                      <Text style={styles.deptPillText}>{lab.department_id || 'Lab'}</Text>
                    </View>
                  )}
                </View>

                {/* Capacity & Staff Meta */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Capacity</Text>
                    <Text style={styles.metaValue}>{lab.capacity || 70} desks</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>In-charge</Text>
                    <Text style={styles.metaValue} numberOfLines={1}>
                      {lab.incharge_name || 'Lab In-Charge'}
                    </Text>
                  </View>
                </View>

                {lab.assistant_incharge_name ? (
                  <View style={styles.subMetaRow}>
                    <Text style={styles.coInchargeText}>
                      Co-incharge: {lab.assistant_incharge_name}
                    </Text>
                  </View>
                ) : null}

                {/* Equipment summary */}
                <View style={styles.equipmentBox}>
                  <Text style={styles.equipmentText} numberOfLines={2}>
                    {lab.equipment_details || 'High-performance computing workstations with Gigabit connectivity'}
                  </Text>
                </View>

                {/* Quick Action Footer */}
                <View style={styles.cardFooter}>
                  <TouchableOpacity
                    style={styles.bookSmallBtn}
                    onPress={() => {
                      setSelectedLabId(lab.lab_id);
                      setModalVisible(true);
                    }}
                  >
                    <Text style={styles.bookSmallBtnText}>Book this facility</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Lab Booking Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request laboratory facility</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.closeBtnText}>&times;</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Select laboratory</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.labPillsRow}>
                {labs.map((l) => {
                  const sel = selectedLabId === l.lab_id;
                  return (
                    <TouchableOpacity
                      key={l.lab_id}
                      style={[styles.smallPill, sel && styles.smallPillActive]}
                      onPress={() => setSelectedLabId(l.lab_id)}
                    >
                      <Text style={[styles.smallPillText, sel && styles.smallPillTextActive]}>{l.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Event title / purpose</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. AI Model Training Practical"
                placeholderTextColor={Colors.textMutedLight}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-10-14"
                placeholderTextColor={Colors.textMutedLight}
                value={bookingDate}
                onChangeText={setBookingDate}
              />

              <Text style={styles.fieldLabel}>Day of week</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.labPillsRow}>
                {DAYS.map((d) => {
                  const sel = dayOfWeek === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.smallPill, sel && styles.smallPillActive]}
                      onPress={() => setDayOfWeek(d)}
                    >
                      <Text style={[styles.smallPillText, sel && styles.smallPillTextActive]}>{d.slice(0, 3)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Period index (1-7)</Text>
              <View style={styles.periodsRow}>
                {PERIODS.map((p) => {
                  const sel = periodIndex === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.periodPill, sel && styles.periodPillActive]}
                      onPress={() => setPeriodIndex(p)}
                    >
                      <Text style={[styles.periodPillText, sel && styles.periodPillTextActive]}>P{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Session notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Details of required software or batch count..."
                placeholderTextColor={Colors.textMutedLight}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <View style={styles.infoNote}>
                <Text style={styles.infoNoteText}>
                  Notice: Lab booking requests will automatically transition the room to Reserved and notify the HOD for approval.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setModalVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                onPress={handleSubmitBooking}
                disabled={submitting}
              >
                <Text style={styles.primaryBtnText}>{submitting ? 'Submitting...' : 'Submit request'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  subheading: {
    fontSize: 12,
    color: Colors.textMutedLight,
    marginTop: 2,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  deck: {
    gap: Spacing.md,
  },
  deckDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  labCard: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    width: '100%',
  },
  labCardDesktop: {
    width: '48.5%',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  titleWrap: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  labName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  labLocation: {
    fontSize: 12,
    color: Colors.textMutedLight,
    marginTop: 2,
    fontFamily: Typography.codeFont,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  deptPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.subtleLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  deptPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondaryLight,
    fontFamily: Typography.codeFont,
  },
  statusAvailable: {
    backgroundColor: Colors.successBg,
  },
  statusReserved: {
    backgroundColor: Colors.warningBg,
  },
  statusOccupied: {
    backgroundColor: Colors.dangerBg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  dotAvailable: {
    backgroundColor: Colors.success,
  },
  dotReserved: {
    backgroundColor: Colors.warning,
  },
  dotOccupied: {
    backgroundColor: Colors.danger,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  textAvailable: {
    color: Colors.success,
  },
  textReserved: {
    color: Colors.warning,
  },
  textOccupied: {
    color: Colors.danger,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: Colors.textMutedLight,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimaryLight,
    marginTop: 2,
  },
  subMetaRow: {
    marginTop: Spacing.xs,
  },
  coInchargeText: {
    fontSize: 11,
    color: Colors.textMutedLight,
  },
  equipmentBox: {
    backgroundColor: Colors.subtleLight,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginTop: Spacing.sm,
  },
  equipmentText: {
    fontSize: 11,
    color: Colors.textSecondaryLight,
    lineHeight: 16,
  },
  cardFooter: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  bookSmallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceLight,
  },
  bookSmallBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textPrimaryLight,
  },
  centerBox: {
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mutedText: {
    fontSize: 12,
    color: Colors.textMutedLight,
  },
  emptyCard: {
    padding: Spacing.xl,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalDialog: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.xl,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  closeBtnText: {
    fontSize: 20,
    color: Colors.textMutedLight,
  },
  modalBody: {
    padding: Spacing.lg,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondaryLight,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  labPillsRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  smallPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.subtleLight,
    marginRight: Spacing.xs,
  },
  smallPillActive: {
    backgroundColor: Colors.brandDeep,
    borderColor: Colors.brandDeep,
  },
  smallPillText: {
    fontSize: 11,
    color: Colors.textSecondaryLight,
  },
  smallPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  periodsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  periodPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.subtleLight,
  },
  periodPillActive: {
    backgroundColor: Colors.accentCyan,
    borderColor: Colors.accentCyan,
  },
  periodPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  periodPillTextActive: {
    color: Colors.brandDeep,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.textPrimaryLight,
    backgroundColor: Colors.surfaceLight,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  infoNote: {
    backgroundColor: Colors.subtleLight,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginTop: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentCyan,
  },
  infoNoteText: {
    fontSize: 11,
    color: Colors.textMutedLight,
    lineHeight: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  secondaryBtnText: {
    fontSize: 12,
    color: Colors.textSecondaryLight,
    fontWeight: '500',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

