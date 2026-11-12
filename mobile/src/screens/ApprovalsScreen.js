import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { ApiService } from '../services/api';

export default function ApprovalsScreen({ currentUser, isDesktop }) {
  const [activeSubTab, setActiveSubTab] = useState('LABS'); // 'LABS' | 'SUBSTITUTES' (Used in mobile)
  const [pendingLabs, setPendingLabs] = useState([]);
  const [pendingSubs, setPendingSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadApprovals();
  }, []);

  async function loadApprovals() {
    try {
      setLoading(true);
      const [labs, subs] = await Promise.all([
        ApiService.getPendingLabRequests().catch(() => []),
        ApiService.getPendingSubstitutions().catch(() => []),
      ]);
      setPendingLabs(labs || []);
      setPendingSubs(subs || []);
    } catch (err) {
      console.warn('Failed to fetch pending approvals:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    loadApprovals();
  };

  async function handleLabApproval(bookingId, action) {
    try {
      setProcessingId(bookingId);
      await ApiService.approveOrRejectLabBooking(bookingId, action);
      Alert.alert(
        action === 'APPROVE' ? 'Lab Request Approved' : 'Lab Request Rejected',
        `The laboratory booking has been ${action === 'APPROVE' ? 'confirmed and allocated' : 'declined'}.`
      );
      loadApprovals();
    } catch (err) {
      Alert.alert('Action Failed', err.message || 'Unable to process approval.');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleSubApproval(subId, status) {
    try {
      setProcessingId(subId);
      await ApiService.approveOrRejectSubstitution(subId, status);
      Alert.alert(
        status === 'APPROVED' ? 'Substitution Approved' : 'Substitution Rejected',
        `Faculty substitution duty has been ${status === 'APPROVED' ? 'confirmed' : 'declined'}.`
      );
      loadApprovals();
    } catch (err) {
      Alert.alert('Action Failed', err.message || 'Unable to process substitution update.');
    } finally {
      setProcessingId(null);
    }
  }

  // Render Lab Cards List
  const renderLabList = () => {
    if (pendingLabs.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No pending lab requests</Text>
          <Text style={styles.emptySubtitle}>All student and faculty lab allocations have been reviewed.</Text>
        </View>
      );
    }

    return (
      <View style={styles.list}>
        {pendingLabs.map((item) => {
          const isBusy = processingId === item.booking_id;
          return (
            <View key={item.booking_id} style={styles.approvalCard}>
              <View style={styles.cardHeader}>
                <View style={styles.flexOne}>
                  <Text style={styles.requestTitle}>{item.title}</Text>
                  <Text style={styles.requestLab}>{item.lab_name} ({item.room_number || item.location})</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Pending</Text>
                </View>
              </View>

              <View style={styles.metaGrid}>
                <Text style={styles.metaRow}>
                  Schedule: <Text style={styles.metaVal}>{item.day_of_week} &bull; Period {item.period_index} ({item.booking_date})</Text>
                </Text>
                <Text style={styles.metaRow}>
                  Requester: <Text style={styles.metaVal}>{item.coordinator_name || item.booked_by_name || 'Student'}</Text>
                </Text>
                {item.description ? (
                  <Text style={styles.descText}>{item.description}</Text>
                ) : null}
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.rejectBtn, isBusy && styles.disabledBtn]}
                  onPress={() => handleLabApproval(item.booking_id, 'REJECT')}
                  disabled={isBusy}
                >
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, isBusy && styles.disabledBtn]}
                  onPress={() => handleLabApproval(item.booking_id, 'APPROVE')}
                  disabled={isBusy}
                >
                  <Text style={styles.approveBtnText}>{isBusy ? 'Processing...' : 'Approve'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // Render Substitutions List
  const renderSubList = () => {
    if (pendingSubs.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No pending substitutions</Text>
          <Text style={styles.emptySubtitle}>Zero faculty leave requests currently awaiting reassignment.</Text>
        </View>
      );
    }

    return (
      <View style={styles.list}>
        {pendingSubs.map((item) => {
          const isBusy = processingId === item.substitution_id;
          return (
            <View key={item.substitution_id} style={styles.approvalCard}>
              <View style={styles.cardHeader}>
                <View style={styles.flexOne}>
                  <Text style={styles.requestTitle}>Faculty Leave: {item.original_faculty_name}</Text>
                  <Text style={styles.requestLab}>Proposed: {item.substitute_faculty_name}</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Pending</Text>
                </View>
              </View>

              <View style={styles.metaGrid}>
                <Text style={styles.metaRow}>
                  Session: <Text style={styles.metaVal}>Period {item.period_index} &bull; {item.date}</Text>
                </Text>
                <Text style={styles.metaRow}>
                  Reason: <Text style={styles.metaVal}>{item.reason || 'Personal leave'}</Text>
                </Text>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.rejectBtn, isBusy && styles.disabledBtn]}
                  onPress={() => handleSubApproval(item.substitution_id, 'REJECTED')}
                  disabled={isBusy}
                >
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, isBusy && styles.disabledBtn]}
                  onPress={() => handleSubApproval(item.substitution_id, 'APPROVED')}
                  disabled={isBusy}
                >
                  <Text style={styles.approveBtnText}>{isBusy ? 'Processing...' : 'Approve'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Approvals queue</Text>
        <Text style={styles.subtitle}>
          Department leadership oversight for lab reservations and faculty leaves
        </Text>
      </View>

      {/* On Desktop: Show Simultaneous Two-Column Split Layout */}
      {isDesktop ? (
        <View style={styles.desktopSplitRow}>
          {/* Left Column: Lab Bookings */}
          <View style={styles.desktopCol}>
            <View style={styles.colHeaderStrip}>
              <Text style={styles.colTitle}>Laboratory Requests</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{pendingLabs.length}</Text>
              </View>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.accentCyan} />
            ) : (
              renderLabList()
            )}
          </View>

          {/* Right Column: Faculty Substitutions */}
          <View style={styles.desktopCol}>
            <View style={styles.colHeaderStrip}>
              <Text style={styles.colTitle}>Faculty Substitutions</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{pendingSubs.length}</Text>
              </View>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.accentCyan} />
            ) : (
              renderSubList()
            )}
          </View>
        </View>
      ) : (
        /* On Mobile: Segmented Tab Switcher */
        <View>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabBtn, activeSubTab === 'LABS' && styles.tabBtnActive]}
              onPress={() => setActiveSubTab('LABS')}
            >
              <Text style={[styles.tabBtnText, activeSubTab === 'LABS' && styles.tabBtnTextActive]}>
                Lab requests ({pendingLabs.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeSubTab === 'SUBSTITUTES' && styles.tabBtnActive]}
              onPress={() => setActiveSubTab('SUBSTITUTES')}
            >
              <Text style={[styles.tabBtnText, activeSubTab === 'SUBSTITUTES' && styles.tabBtnTextActive]}>
                Substitutions ({pendingSubs.length})
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={Colors.accentCyan} />
              <Text style={styles.mutedText}>Fetching queue records...</Text>
            </View>
          ) : activeSubTab === 'LABS' ? (
            renderLabList()
          ) : (
            renderSubList()
          )}
        </View>
      )}
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
  },
  contentDesktop: {
    padding: Spacing.xl,
  },
  headerBlock: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMutedLight,
    marginTop: 2,
  },
  desktopSplitRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  desktopCol: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  colHeaderStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginBottom: Spacing.md,
  },
  colTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  countPill: {
    backgroundColor: Colors.subtleLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.brandDeep,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.subtleLight,
    padding: 3,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  tabBtnActive: {
    backgroundColor: Colors.surfaceLight,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondaryLight,
  },
  tabBtnTextActive: {
    fontWeight: '600',
    color: Colors.brandDeep,
  },
  list: {
    gap: Spacing.md,
  },
  approvalCard: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  flexOne: {
    flex: 1,
  },
  requestTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  requestLab: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 2,
    fontWeight: '500',
  },
  pendingBadge: {
    backgroundColor: Colors.warningBg,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.warning,
  },
  metaGrid: {
    backgroundColor: Colors.subtleLight,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    gap: 3,
    marginBottom: Spacing.md,
  },
  metaRow: {
    fontSize: 11,
    color: Colors.textMutedLight,
  },
  metaVal: {
    color: Colors.textPrimaryLight,
    fontWeight: '500',
  },
  descText: {
    fontSize: 11,
    color: Colors.textSecondaryLight,
    marginTop: 2,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  rejectBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  rejectBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.danger,
  },
  approveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  approveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabledBtn: {
    opacity: 0.6,
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
  emptySubtitle: {
    fontSize: 12,
    color: Colors.textMutedLight,
    marginTop: 4,
    textAlign: 'center',
  },
});
