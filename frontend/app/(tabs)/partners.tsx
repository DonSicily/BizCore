import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  Card,
  Button,
  Input,
  Badge,
  LoadingScreen,
  EmptyState,
} from '../../src/components/ThemedComponents';
import { useAppStore } from '../../src/store/appStore';
import { Supplier, Distributor } from '../../src/types';

type PartnerTab = 'suppliers' | 'distributors';

export default function PartnersScreen() {
  const {
    suppliers,
    distributors,
    isLoading,
    fetchSuppliers,
    fetchDistributors,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createDistributor,
    updateDistributor,
    deleteDistributor,
  } = useAppStore();

  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<PartnerTab>('suppliers');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Supplier | Distributor | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    payment_terms_days: '30',
    tax_id: '',
    territory: '',
    commission_percent: '0',
    credit_limit: '0',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([fetchSuppliers(), fetchDistributors()]);
    } catch (error) {
      console.error('Error loading partners:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      address: '',
      payment_terms_days: '30',
      tax_id: '',
      territory: '',
      commission_percent: '0',
      credit_limit: '0',
    });
    setSelectedPartner(null);
  };

  const openPartnerDetail = (partner: Supplier | Distributor) => {
    setSelectedPartner(partner);
    setFormData({
      name: partner.name,
      contact_person: partner.contact_person || '',
      phone: partner.phone || '',
      email: partner.email || '',
      address: partner.address || '',
      payment_terms_days: 'payment_terms_days' in partner ? partner.payment_terms_days.toString() : '30',
      tax_id: 'tax_id' in partner ? partner.tax_id || '' : '',
      territory: 'territory' in partner ? partner.territory || '' : '',
      commission_percent: 'commission_percent' in partner ? partner.commission_percent.toString() : '0',
      credit_limit: 'credit_limit' in partner ? partner.credit_limit.toString() : '0',
    });
    setShowDetailModal(true);
  };

  const handleCreate = async () => {
    try {
      if (!formData.name) {
        Alert.alert('Error', 'Name is required');
        return;
      }

      if (activeTab === 'suppliers') {
        await createSupplier({
          name: formData.name,
          contact_person: formData.contact_person,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          payment_terms_days: parseInt(formData.payment_terms_days) || 30,
          tax_id: formData.tax_id,
        });
      } else {
        await createDistributor({
          name: formData.name,
          contact_person: formData.contact_person,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          territory: formData.territory,
          commission_percent: parseFloat(formData.commission_percent) || 0,
          credit_limit: parseFloat(formData.credit_limit) || 0,
        });
      }

      setShowAddModal(false);
      resetForm();
      Alert.alert('Success', `${activeTab === 'suppliers' ? 'Supplier' : 'Distributor'} created`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create');
    }
  };

  const handleUpdate = async () => {
    if (!selectedPartner) return;

    try {
      if (activeTab === 'suppliers') {
        await updateSupplier((selectedPartner as Supplier).supplier_id, {
          name: formData.name,
          contact_person: formData.contact_person,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          payment_terms_days: parseInt(formData.payment_terms_days) || 30,
          tax_id: formData.tax_id,
        });
      } else {
        await updateDistributor((selectedPartner as Distributor).distributor_id, {
          name: formData.name,
          contact_person: formData.contact_person,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          territory: formData.territory,
          commission_percent: parseFloat(formData.commission_percent) || 0,
          credit_limit: parseFloat(formData.credit_limit) || 0,
        });
      }

      setShowDetailModal(false);
      resetForm();
      Alert.alert('Success', 'Updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update');
    }
  };

  const handleDelete = () => {
    if (!selectedPartner) return;

    Alert.alert(
      'Delete Partner',
      `Are you sure you want to delete "${selectedPartner.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (activeTab === 'suppliers') {
                await deleteSupplier((selectedPartner as Supplier).supplier_id);
              } else {
                await deleteDistributor((selectedPartner as Distributor).distributor_id);
              }
              setShowDetailModal(false);
              resetForm();
              Alert.alert('Success', 'Deleted successfully');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const handleCall = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleEmail = (email: string) => {
    if (email) {
      Linking.openURL(`mailto:${email}`);
    }
  };

  const partners = activeTab === 'suppliers' ? suppliers : distributors;

  if (isLoading && suppliers.length === 0 && distributors.length === 0) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Partners</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'suppliers' && styles.activeTab]}
          onPress={() => setActiveTab('suppliers')}
        >
          <Ionicons
            name="business"
            size={18}
            color={activeTab === 'suppliers' ? Colors.text : Colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'suppliers' && styles.activeTabText]}>
            Suppliers ({suppliers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'distributors' && styles.activeTab]}
          onPress={() => setActiveTab('distributors')}
        >
          <Ionicons
            name="people"
            size={18}
            color={activeTab === 'distributors' ? Colors.text : Colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'distributors' && styles.activeTabText]}>
            Distributors ({distributors.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Partners List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.content}
      >
        {partners.length === 0 ? (
          <EmptyState
            message={`No ${activeTab} found`}
            icon={activeTab === 'suppliers' ? 'business-outline' : 'people-outline'}
          />
        ) : (
          partners.map((partner) => {
            const isSupplier = 'supplier_id' in partner;
            const partnerId = isSupplier
              ? (partner as Supplier).supplier_id
              : (partner as Distributor).distributor_id;

            return (
              <TouchableOpacity
                key={partnerId}
                style={styles.partnerCard}
                onPress={() => openPartnerDetail(partner)}
                activeOpacity={0.7}
              >
                <View style={styles.partnerHeader}>
                  <View style={styles.partnerAvatar}>
                    <Text style={styles.partnerAvatarText}>
                      {partner.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.partnerInfo}>
                    <Text style={styles.partnerName}>{partner.name}</Text>
                    {partner.contact_person && (
                      <Text style={styles.partnerContact}>{partner.contact_person}</Text>
                    )}
                  </View>
                  {isSupplier && (partner as Supplier).rating > 0 && (
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={14} color={Colors.warning} />
                      <Text style={styles.ratingText}>
                        {(partner as Supplier).rating.toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.partnerDetails}>
                  {partner.phone && (
                    <TouchableOpacity
                      style={styles.contactButton}
                      onPress={() => handleCall(partner.phone!)}
                    >
                      <Ionicons name="call" size={16} color={Colors.success} />
                      <Text style={styles.contactText}>{partner.phone}</Text>
                    </TouchableOpacity>
                  )}
                  {partner.email && (
                    <TouchableOpacity
                      style={styles.contactButton}
                      onPress={() => handleEmail(partner.email!)}
                    >
                      <Ionicons name="mail" size={16} color={Colors.primary} />
                      <Text style={styles.contactText} numberOfLines={1}>
                        {partner.email}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.partnerFooter}>
                  {isSupplier ? (
                    <Badge
                      text={`Net ${(partner as Supplier).payment_terms_days} days`}
                      variant="info"
                    />
                  ) : (
                    <>
                      {(partner as Distributor).territory && (
                        <Badge text={(partner as Distributor).territory!} variant="default" />
                      )}
                      <Text style={styles.creditLimit}>
                        Credit: ${(partner as Distributor).credit_limit.toFixed(0)}
                      </Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Add {activeTab === 'suppliers' ? 'Supplier' : 'Distributor'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Input
                label="Name *"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter name"
              />
              <Input
                label="Contact Person"
                value={formData.contact_person}
                onChangeText={(text) => setFormData({ ...formData, contact_person: text })}
                placeholder="Enter contact person"
              />
              <Input
                label="Phone"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
              />
              <Input
                label="Email"
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="Enter email"
                keyboardType="email-address"
              />
              <Input
                label="Address"
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                placeholder="Enter address"
                multiline
                numberOfLines={2}
              />
              {activeTab === 'suppliers' ? (
                <>
                  <Input
                    label="Payment Terms (days)"
                    value={formData.payment_terms_days}
                    onChangeText={(text) => setFormData({ ...formData, payment_terms_days: text })}
                    placeholder="30"
                    keyboardType="numeric"
                  />
                  <Input
                    label="Tax ID"
                    value={formData.tax_id}
                    onChangeText={(text) => setFormData({ ...formData, tax_id: text })}
                    placeholder="Enter tax ID"
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Territory/Region"
                    value={formData.territory}
                    onChangeText={(text) => setFormData({ ...formData, territory: text })}
                    placeholder="Enter territory"
                  />
                  <Input
                    label="Commission %"
                    value={formData.commission_percent}
                    onChangeText={(text) => setFormData({ ...formData, commission_percent: text })}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                  <Input
                    label="Credit Limit"
                    value={formData.credit_limit}
                    onChangeText={(text) => setFormData({ ...formData, credit_limit: text })}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </>
              )}
              <Button title="Create" onPress={handleCreate} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Detail/Edit Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edit {activeTab === 'suppliers' ? 'Supplier' : 'Distributor'}
              </Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Input
                label="Name *"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter name"
              />
              <Input
                label="Contact Person"
                value={formData.contact_person}
                onChangeText={(text) => setFormData({ ...formData, contact_person: text })}
                placeholder="Enter contact person"
              />
              <Input
                label="Phone"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
              />
              <Input
                label="Email"
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="Enter email"
                keyboardType="email-address"
              />
              <Input
                label="Address"
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                placeholder="Enter address"
                multiline
                numberOfLines={2}
              />
              {activeTab === 'suppliers' ? (
                <>
                  <Input
                    label="Payment Terms (days)"
                    value={formData.payment_terms_days}
                    onChangeText={(text) => setFormData({ ...formData, payment_terms_days: text })}
                    placeholder="30"
                    keyboardType="numeric"
                  />
                  <Input
                    label="Tax ID"
                    value={formData.tax_id}
                    onChangeText={(text) => setFormData({ ...formData, tax_id: text })}
                    placeholder="Enter tax ID"
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Territory/Region"
                    value={formData.territory}
                    onChangeText={(text) => setFormData({ ...formData, territory: text })}
                    placeholder="Enter territory"
                  />
                  <Input
                    label="Commission %"
                    value={formData.commission_percent}
                    onChangeText={(text) => setFormData({ ...formData, commission_percent: text })}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                  <Input
                    label="Credit Limit"
                    value={formData.credit_limit}
                    onChangeText={(text) => setFormData({ ...formData, credit_limit: text })}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </>
              )}
              <Button title="Update" onPress={handleUpdate} style={{ marginTop: 16 }} />
              <Button
                title="Delete"
                variant="danger"
                onPress={handleDelete}
                style={{ marginTop: 12 }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeTab: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.text,
  },
  content: {
    paddingHorizontal: 20,
  },
  partnerCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  partnerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  partnerAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  partnerContact: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${Colors.warning}20`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.warning,
  },
  partnerDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactText: {
    fontSize: 13,
    color: Colors.textSecondary,
    maxWidth: 150,
  },
  partnerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  creditLimit: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
});
