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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Colors,
  Card,
  Button,
  Input,
  Badge,
  ListItem,
  LoadingScreen,
  EmptyState,
} from '../src/components/ThemedComponents';
import { useAppStore } from '../src/store/appStore';
import { formatCurrency } from '../src/config/clientConfig';
import { format } from 'date-fns';
import api from '../src/utils/api';

interface Quotation {
  quotation_id: string;
  quotation_number: string;
  distributor_id: string;
  distributor_name: string;
  items: any[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  valid_until: string;
  notes?: string;
  created_at: string;
}

export default function QuotationsScreen() {
  const router = useRouter();
  const { distributors, products, warehouses, fetchDistributors, fetchProducts, fetchWarehouses } = useAppStore();
  
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Form state
  const [selectedDistributor, setSelectedDistributor] = useState('');
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [taxAmount, setTaxAmount] = useState('0');
  const [validDays, setValidDays] = useState('30');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([
        fetchQuotations(),
        fetchDistributors(),
        fetchProducts(),
        fetchWarehouses(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuotations = async () => {
    try {
      const response = await api.get('/quotations');
      setQuotations(response.data);
    } catch (error) {
      console.error('Error fetching quotations:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchQuotations();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return Colors.success;
      case 'rejected': return Colors.danger;
      case 'expired': return Colors.textMuted;
      case 'converted': return Colors.info;
      default: return Colors.warning;
    }
  };

  const handleCreateQuotation = async () => {
    if (!selectedDistributor || selectedItems.length === 0) {
      Alert.alert('Error', 'Please select a distributor and add items');
      return;
    }

    try {
      const payload = {
        distributor_id: selectedDistributor,
        items: selectedItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount || 0,
        })),
        tax_amount: parseFloat(taxAmount) || 0,
        valid_days: parseInt(validDays) || 30,
        notes,
      };

      await api.post('/quotations', payload);
      Alert.alert('Success', 'Quotation created successfully');
      setShowAddModal(false);
      resetForm();
      fetchQuotations();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create quotation');
    }
  };

  const handleUpdateStatus = async (quotationId: string, newStatus: string) => {
    try {
      await api.put(`/quotations/${quotationId}/status?status=${newStatus}`);
      Alert.alert('Success', `Quotation ${newStatus}`);
      fetchQuotations();
      setShowDetailModal(false);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update status');
    }
  };

  const handleConvertToOrder = async (quotation: Quotation) => {
    if (warehouses.length === 0) {
      Alert.alert('Error', 'No warehouses available');
      return;
    }

    Alert.alert(
      'Convert to Sales Order',
      'This will create a new Sales Order from this quotation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert',
          onPress: async () => {
            try {
              await api.post(`/quotations/${quotation.quotation_id}/convert-to-order?warehouse_id=${warehouses[0]._id || warehouses[0].warehouse_id}`);
              Alert.alert('Success', 'Sales Order created successfully');
              fetchQuotations();
              setShowDetailModal(false);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to convert quotation');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setSelectedDistributor('');
    setSelectedItems([]);
    setTaxAmount('0');
    setValidDays('30');
    setNotes('');
  };

  const addItem = () => {
    setSelectedItems([...selectedItems, { product_id: '', quantity: 1, unit_price: 0, discount: 0 }]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...selectedItems];
    updated[index][field] = value;
    
    if (field === 'product_id') {
      const product = products.find((p: any) => p.product_id === value || p._id === value);
      if (product) {
        updated[index].unit_price = product.selling_price;
      }
    }
    
    setSelectedItems(updated);
  };

  const removeItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    const subtotal = selectedItems.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unit_price;
      const discount = lineTotal * (item.discount / 100);
      return sum + lineTotal - discount;
    }, 0);
    return subtotal + (parseFloat(taxAmount) || 0);
  };

  const filteredQuotations = statusFilter === 'all' 
    ? quotations 
    : quotations.filter(q => q.status === statusFilter);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Quotations</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {['all', 'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'].map(status => (
          <TouchableOpacity
            key={status}
            style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
            onPress={() => setStatusFilter(status)}
          >
            <Text style={[styles.filterText, statusFilter === status && styles.filterTextActive]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.content}
      >
        {filteredQuotations.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No Quotations"
            message="Create your first quotation to get started"
          />
        ) : (
          filteredQuotations.map(quotation => (
            <TouchableOpacity
              key={quotation.quotation_id}
              style={styles.quotationCard}
              onPress={() => {
                setSelectedQuotation(quotation);
                setShowDetailModal(true);
              }}
            >
              <View style={styles.quotationHeader}>
                <View>
                  <Text style={styles.quotationNumber}>{quotation.quotation_number}</Text>
                  <Text style={styles.distributorName}>{quotation.distributor_name}</Text>
                </View>
                <Badge
                  text={quotation.status}
                  variant={quotation.status === 'accepted' ? 'success' : quotation.status === 'rejected' ? 'danger' : 'warning'}
                />
              </View>
              <View style={styles.quotationFooter}>
                <Text style={styles.quotationDate}>
                  Valid until: {format(new Date(quotation.valid_until), 'MMM dd, yyyy')}
                </Text>
                <Text style={styles.quotationTotal}>{formatCurrency(quotation.total_amount)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Quotation Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Quotation</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Distributor Selection */}
            <Text style={styles.label}>Select Distributor</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectionRow}>
              {distributors.map((dist: any) => (
                <TouchableOpacity
                  key={dist._id || dist.distributor_id}
                  style={[
                    styles.selectionChip,
                    selectedDistributor === (dist._id || dist.distributor_id) && styles.selectionChipActive,
                  ]}
                  onPress={() => setSelectedDistributor(dist._id || dist.distributor_id)}
                >
                  <Text style={[
                    styles.selectionChipText,
                    selectedDistributor === (dist._id || dist.distributor_id) && styles.selectionChipTextActive,
                  ]}>
                    {dist.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Items */}
            <View style={styles.itemsHeader}>
              <Text style={styles.label}>Items</Text>
              <TouchableOpacity onPress={addItem}>
                <Ionicons name="add-circle" size={24} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {selectedItems.map((item, index) => (
              <Card key={index} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={styles.itemField}>
                    <Text style={styles.itemLabel}>Product</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {products.slice(0, 10).map((prod: any) => (
                        <TouchableOpacity
                          key={prod._id || prod.product_id}
                          style={[
                            styles.productChip,
                            item.product_id === (prod._id || prod.product_id) && styles.productChipActive,
                          ]}
                          onPress={() => updateItem(index, 'product_id', prod._id || prod.product_id)}
                        >
                          <Text style={styles.productChipText} numberOfLines={1}>
                            {prod.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
                <View style={styles.itemNumbers}>
                  <View style={styles.numberField}>
                    <Text style={styles.itemLabel}>Qty</Text>
                    <TextInput
                      style={styles.numberInput}
                      value={String(item.quantity)}
                      onChangeText={(v) => updateItem(index, 'quantity', parseInt(v) || 0)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.numberField}>
                    <Text style={styles.itemLabel}>Price</Text>
                    <TextInput
                      style={styles.numberInput}
                      value={String(item.unit_price)}
                      onChangeText={(v) => updateItem(index, 'unit_price', parseFloat(v) || 0)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.numberField}>
                    <Text style={styles.itemLabel}>Disc %</Text>
                    <TextInput
                      style={styles.numberInput}
                      value={String(item.discount)}
                      onChangeText={(v) => updateItem(index, 'discount', parseFloat(v) || 0)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </Card>
            ))}

            {/* Tax & Valid Days */}
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Tax Amount</Text>
                <TextInput
                  style={styles.input}
                  value={taxAmount}
                  onChangeText={setTaxAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Valid Days</Text>
                <TextInput
                  style={styles.input}
                  value={validDays}
                  onChangeText={setValidDays}
                  keyboardType="numeric"
                  placeholder="30"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            {/* Notes */}
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />

            {/* Total */}
            <Card style={styles.totalCard}>
              <Text style={styles.totalLabel}>Estimated Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(calculateTotal())}</Text>
            </Card>

            <Button title="Create Quotation" onPress={handleCreateQuotation} style={{ marginTop: 16 }} />
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedQuotation?.quotation_number}</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedQuotation && (
            <ScrollView style={styles.modalContent}>
              <Card>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Customer</Text>
                  <Text style={styles.detailValue}>{selectedQuotation.distributor_name}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Badge
                    text={selectedQuotation.status}
                    variant={selectedQuotation.status === 'accepted' ? 'success' : 'warning'}
                  />
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Valid Until</Text>
                  <Text style={styles.detailValue}>
                    {format(new Date(selectedQuotation.valid_until), 'MMM dd, yyyy')}
                  </Text>
                </View>
              </Card>

              <Text style={styles.sectionTitle}>Items</Text>
              {selectedQuotation.items.map((item: any, idx: number) => (
                <Card key={idx} style={styles.itemDetailCard}>
                  <Text style={styles.itemName}>{item.product_name}</Text>
                  <View style={styles.itemDetailRow}>
                    <Text style={styles.itemDetailText}>Qty: {item.quantity}</Text>
                    <Text style={styles.itemDetailText}>@ {formatCurrency(item.unit_price)}</Text>
                    {item.discount_percent > 0 && (
                      <Text style={styles.itemDiscount}>-{item.discount_percent}%</Text>
                    )}
                  </View>
                </Card>
              ))}

              <Card style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(selectedQuotation.subtotal)}</Text>
                </View>
                {selectedQuotation.discount_amount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Discount</Text>
                    <Text style={[styles.summaryValue, { color: Colors.success }]}>
                      -{formatCurrency(selectedQuotation.discount_amount)}
                    </Text>
                  </View>
                )}
                {selectedQuotation.tax_amount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tax</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(selectedQuotation.tax_amount)}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatCurrency(selectedQuotation.total_amount)}</Text>
                </View>
              </Card>

              {/* Actions */}
              {selectedQuotation.status === 'draft' && (
                <View style={styles.actionsRow}>
                  <Button
                    title="Send"
                    variant="primary"
                    onPress={() => handleUpdateStatus(selectedQuotation.quotation_id, 'sent')}
                    style={styles.actionBtn}
                  />
                </View>
              )}
              {selectedQuotation.status === 'sent' && (
                <View style={styles.actionsRow}>
                  <Button
                    title="Accept"
                    variant="primary"
                    onPress={() => handleUpdateStatus(selectedQuotation.quotation_id, 'accepted')}
                    style={styles.actionBtn}
                  />
                  <Button
                    title="Reject"
                    variant="secondary"
                    onPress={() => handleUpdateStatus(selectedQuotation.quotation_id, 'rejected')}
                    style={styles.actionBtn}
                  />
                </View>
              )}
              {selectedQuotation.status === 'accepted' && (
                <Button
                  title="Convert to Sales Order"
                  variant="primary"
                  onPress={() => handleConvertToOrder(selectedQuotation)}
                  style={{ marginTop: 16 }}
                />
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: { paddingHorizontal: 16, paddingVertical: 12 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { color: Colors.textSecondary, fontSize: 14 },
  filterTextActive: { color: Colors.text, fontWeight: '600' },
  content: { padding: 16 },
  quotationCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quotationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quotationNumber: { fontSize: 16, fontWeight: '700', color: Colors.text },
  distributorName: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  quotationFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  quotationDate: { fontSize: 12, color: Colors.textMuted },
  quotationTotal: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  modalContent: { flex: 1, padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, marginTop: 16 },
  selectionRow: { marginBottom: 8 },
  selectionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectionChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  selectionChipText: { color: Colors.textSecondary, fontSize: 14 },
  selectionChipTextActive: { color: Colors.text, fontWeight: '600' },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  itemCard: { marginTop: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start' },
  itemField: { flex: 1 },
  itemLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  removeBtn: { padding: 8 },
  productChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.cardAlt,
    marginRight: 6,
  },
  productChipActive: { backgroundColor: Colors.primary },
  productChipText: { fontSize: 12, color: Colors.text, maxWidth: 80 },
  itemNumbers: { flexDirection: 'row', marginTop: 12, gap: 12 },
  numberField: { flex: 1 },
  numberInput: {
    backgroundColor: Colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    color: Colors.text,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  totalCard: { marginTop: 16, alignItems: 'center' },
  totalLabel: { fontSize: 14, color: Colors.textSecondary },
  totalValue: { fontSize: 28, fontWeight: '700', color: Colors.primary, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginTop: 20, marginBottom: 8 },
  itemDetailCard: { marginBottom: 8 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  itemDetailRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  itemDetailText: { fontSize: 13, color: Colors.textSecondary },
  itemDiscount: { fontSize: 13, color: Colors.success },
  summaryCard: { marginTop: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '500', color: Colors.text },
  totalRow: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8, paddingTop: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  detailLabel: { fontSize: 14, color: Colors.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '500', color: Colors.text },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: { flex: 1 },
});
