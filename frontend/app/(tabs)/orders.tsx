import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { PurchaseOrder, SalesOrder, OrderStatus } from '../../src/types';
import { format } from 'date-fns';

type OrderTab = 'purchase' | 'sales';

export default function OrdersScreen() {
  const {
    purchaseOrders,
    salesOrders,
    products,
    suppliers,
    distributors,
    warehouses,
    isLoading,
    fetchPurchaseOrders,
    fetchSalesOrders,
    fetchProducts,
    fetchSuppliers,
    fetchDistributors,
    fetchWarehouses,
    createPurchaseOrder,
    createSalesOrder,
    updatePurchaseOrder,
    updateSalesOrder,
  } = useAppStore();

  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderTab>('purchase');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | SalesOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  // Form state for new order
  const [orderForm, setOrderForm] = useState({
    supplier_id: '',
    distributor_id: '',
    warehouse_id: '',
    notes: '',
    items: [] as { product_id: string; quantity: string; unit_price: string }[],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([
        fetchPurchaseOrders(),
        fetchSalesOrders(),
        fetchProducts(),
        fetchSuppliers(),
        fetchDistributors(),
        fetchWarehouses(),
      ]);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const resetForm = () => {
    setOrderForm({
      supplier_id: '',
      distributor_id: '',
      warehouse_id: '',
      notes: '',
      items: [],
    });
  };

  const addItemToOrder = () => {
    setOrderForm({
      ...orderForm,
      items: [...orderForm.items, { product_id: '', quantity: '', unit_price: '' }],
    });
  };

  const removeItemFromOrder = (index: number) => {
    const newItems = orderForm.items.filter((_, i) => i !== index);
    setOrderForm({ ...orderForm, items: newItems });
  };

  const updateOrderItem = (index: number, field: string, value: string) => {
    const newItems = [...orderForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setOrderForm({ ...orderForm, items: newItems });
  };

  const handleCreateOrder = async () => {
    try {
      const validItems = orderForm.items.filter(
        (item) => item.product_id && item.quantity && item.unit_price
      );

      if (validItems.length === 0) {
        Alert.alert('Error', 'Please add at least one item');
        return;
      }

      if (!orderForm.warehouse_id) {
        Alert.alert('Error', 'Please select a warehouse');
        return;
      }

      if (activeTab === 'purchase') {
        if (!orderForm.supplier_id) {
          Alert.alert('Error', 'Please select a supplier');
          return;
        }
        await createPurchaseOrder({
          supplier_id: orderForm.supplier_id,
          warehouse_id: orderForm.warehouse_id,
          notes: orderForm.notes,
          items: validItems.map((item) => ({
            product_id: item.product_id,
            quantity: parseFloat(item.quantity),
            unit_price: parseFloat(item.unit_price),
          })),
        });
      } else {
        if (!orderForm.distributor_id) {
          Alert.alert('Error', 'Please select a distributor');
          return;
        }
        await createSalesOrder({
          distributor_id: orderForm.distributor_id,
          warehouse_id: orderForm.warehouse_id,
          notes: orderForm.notes,
          items: validItems.map((item) => ({
            product_id: item.product_id,
            quantity: parseFloat(item.quantity),
            unit_price: parseFloat(item.unit_price),
          })),
        });
      }

      setShowAddModal(false);
      resetForm();
      Alert.alert('Success', `${activeTab === 'purchase' ? 'Purchase' : 'Sales'} order created`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create order');
    }
  };

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (!selectedOrder) return;

    try {
      if (activeTab === 'purchase') {
        await updatePurchaseOrder((selectedOrder as PurchaseOrder).po_id, { status: newStatus });
      } else {
        await updateSalesOrder((selectedOrder as SalesOrder).so_id, { status: newStatus });
      }
      setShowDetailModal(false);
      Alert.alert('Success', 'Order status updated');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update status');
    }
  };

  const getStatusColor = (status: OrderStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    switch (status) {
      case 'draft':
        return 'default';
      case 'ordered':
        return 'info';
      case 'received':
      case 'delivered':
      case 'paid':
        return 'success';
      case 'partial':
        return 'warning';
      case 'cancelled':
        return 'danger';
      default:
        return 'default';
    }
  };

  const getNextStatus = (currentStatus: OrderStatus): OrderStatus[] => {
    if (activeTab === 'purchase') {
      switch (currentStatus) {
        case 'draft':
          return ['ordered', 'cancelled'];
        case 'ordered':
          return ['received', 'cancelled'];
        case 'received':
          return ['paid'];
        default:
          return [];
      }
    } else {
      switch (currentStatus) {
        case 'draft':
          return ['ordered', 'cancelled'];
        case 'ordered':
          return ['delivered', 'cancelled'];
        case 'delivered':
          return ['paid'];
        default:
          return [];
      }
    }
  };

  const filteredOrders = activeTab === 'purchase'
    ? purchaseOrders.filter((o) => statusFilter === 'all' || o.status === statusFilter)
    : salesOrders.filter((o) => statusFilter === 'all' || o.status === statusFilter);

  if (isLoading && purchaseOrders.length === 0 && salesOrders.length === 0) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
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
          style={[styles.tab, activeTab === 'purchase' && styles.activeTab]}
          onPress={() => setActiveTab('purchase')}
        >
          <Ionicons
            name="arrow-down-circle"
            size={18}
            color={activeTab === 'purchase' ? Colors.text : Colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'purchase' && styles.activeTabText]}>
            Purchase
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sales' && styles.activeTab]}
          onPress={() => setActiveTab('sales')}
        >
          <Ionicons
            name="arrow-up-circle"
            size={18}
            color={activeTab === 'sales' ? Colors.text : Colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'sales' && styles.activeTabText]}>
            Sales
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {(['all', 'draft', 'ordered', activeTab === 'purchase' ? 'received' : 'delivered', 'paid', 'cancelled'] as const).map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
            onPress={() => setStatusFilter(status as any)}
          >
            <Text style={[styles.filterChipText, statusFilter === status && styles.filterChipTextActive]}>
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Orders List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.content}
      >
        {filteredOrders.length === 0 ? (
          <EmptyState
            message={`No ${activeTab} orders found`}
            icon={activeTab === 'purchase' ? 'cube-outline' : 'cart-outline'}
          />
        ) : (
          filteredOrders.map((order) => {
            const isPurchase = 'po_id' in order;
            const orderId = isPurchase ? (order as PurchaseOrder).po_id : (order as SalesOrder).so_id;
            const orderNumber = isPurchase
              ? (order as PurchaseOrder).po_number
              : (order as SalesOrder).so_number;
            const partyName = isPurchase
              ? (order as PurchaseOrder).supplier_name
              : (order as SalesOrder).distributor_name;

            return (
              <TouchableOpacity
                key={orderId}
                style={styles.orderCard}
                onPress={() => {
                  setSelectedOrder(order);
                  setShowDetailModal(true);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.orderHeader}>
                  <View>
                    <Text style={styles.orderNumber}>{orderNumber}</Text>
                    <Text style={styles.orderParty}>{partyName || 'Unknown'}</Text>
                  </View>
                  <Badge text={order.status.toUpperCase()} variant={getStatusColor(order.status)} />
                </View>
                <View style={styles.orderDetails}>
                  <View style={styles.orderDetailItem}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.orderDetailText}>
                      {format(new Date(order.order_date), 'MMM dd, yyyy')}
                    </Text>
                  </View>
                  <View style={styles.orderDetailItem}>
                    <Ionicons name="cube-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.orderDetailText}>
                      {order.items?.length || 0} items
                    </Text>
                  </View>
                </View>
                <View style={styles.orderFooter}>
                  <Text style={styles.orderTotalLabel}>Total</Text>
                  <Text style={styles.orderTotalValue}>
                    ${order.total_amount?.toFixed(2) || '0.00'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Order Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                New {activeTab === 'purchase' ? 'Purchase' : 'Sales'} Order
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Partner Selection */}
              {activeTab === 'purchase' ? (
                <>
                  <Text style={styles.inputLabel}>Supplier *</Text>
                  <View style={styles.pickerContainer}>
                    {suppliers.map((s) => (
                      <TouchableOpacity
                        key={s.supplier_id}
                        style={[
                          styles.pickerOption,
                          orderForm.supplier_id === s.supplier_id && styles.pickerOptionActive,
                        ]}
                        onPress={() => setOrderForm({ ...orderForm, supplier_id: s.supplier_id })}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            orderForm.supplier_id === s.supplier_id && styles.pickerOptionTextActive,
                          ]}
                        >
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>Distributor *</Text>
                  <View style={styles.pickerContainer}>
                    {distributors.map((d) => (
                      <TouchableOpacity
                        key={d.distributor_id}
                        style={[
                          styles.pickerOption,
                          orderForm.distributor_id === d.distributor_id && styles.pickerOptionActive,
                        ]}
                        onPress={() => setOrderForm({ ...orderForm, distributor_id: d.distributor_id })}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            orderForm.distributor_id === d.distributor_id && styles.pickerOptionTextActive,
                          ]}
                        >
                          {d.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Warehouse Selection */}
              <Text style={styles.inputLabel}>Warehouse *</Text>
              <View style={styles.pickerContainer}>
                {warehouses.map((w) => (
                  <TouchableOpacity
                    key={w.warehouse_id}
                    style={[
                      styles.pickerOption,
                      orderForm.warehouse_id === w.warehouse_id && styles.pickerOptionActive,
                    ]}
                    onPress={() => setOrderForm({ ...orderForm, warehouse_id: w.warehouse_id })}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        orderForm.warehouse_id === w.warehouse_id && styles.pickerOptionTextActive,
                      ]}
                    >
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Items */}
              <View style={styles.itemsHeader}>
                <Text style={styles.inputLabel}>Items</Text>
                <TouchableOpacity style={styles.addItemButton} onPress={addItemToOrder}>
                  <Ionicons name="add" size={18} color={Colors.primary} />
                  <Text style={styles.addItemText}>Add Item</Text>
                </TouchableOpacity>
              </View>

              {orderForm.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <View style={styles.itemProductSelect}>
                    <Text style={styles.itemLabel}>Product</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.productScroll}
                    >
                      {products.slice(0, 10).map((p) => (
                        <TouchableOpacity
                          key={p.product_id}
                          style={[
                            styles.productChip,
                            item.product_id === p.product_id && styles.productChipActive,
                          ]}
                          onPress={() => {
                            updateOrderItem(index, 'product_id', p.product_id);
                            updateOrderItem(
                              index,
                              'unit_price',
                              (activeTab === 'purchase' ? p.cost_price : p.selling_price).toString()
                            );
                          }}
                        >
                          <Text
                            style={[
                              styles.productChipText,
                              item.product_id === p.product_id && styles.productChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <View style={styles.itemInputRow}>
                    <View style={styles.itemInput}>
                      <Input
                        label="Qty"
                        value={item.quantity}
                        onChangeText={(text) => updateOrderItem(index, 'quantity', text)}
                        placeholder="0"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.itemInput}>
                      <Input
                        label="Price"
                        value={item.unit_price}
                        onChangeText={(text) => updateOrderItem(index, 'unit_price', text)}
                        placeholder="0.00"
                        keyboardType="numeric"
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.removeItemButton}
                      onPress={() => removeItemFromOrder(index)}
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <Input
                label="Notes"
                value={orderForm.notes}
                onChangeText={(text) => setOrderForm({ ...orderForm, notes: text })}
                placeholder="Add notes..."
                multiline
                numberOfLines={2}
              />

              <Button title="Create Order" onPress={handleCreateOrder} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Order Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order Details</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {selectedOrder && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Order #</Text>
                    <Text style={styles.detailValue}>
                      {'po_number' in selectedOrder
                        ? selectedOrder.po_number
                        : selectedOrder.so_number}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {activeTab === 'purchase' ? 'Supplier' : 'Distributor'}
                    </Text>
                    <Text style={styles.detailValue}>
                      {'supplier_name' in selectedOrder
                        ? selectedOrder.supplier_name
                        : selectedOrder.distributor_name}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>
                      {format(new Date(selectedOrder.order_date), 'MMM dd, yyyy')}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Badge
                      text={selectedOrder.status.toUpperCase()}
                      variant={getStatusColor(selectedOrder.status)}
                    />
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Items</Text>
                {selectedOrder.items?.map((item, index) => (
                  <View key={index} style={styles.itemDetailRow}>
                    <View style={styles.itemDetailInfo}>
                      <Text style={styles.itemDetailName}>{item.product_name || 'Product'}</Text>
                      <Text style={styles.itemDetailMeta}>
                        {item.quantity} x ${item.unit_price.toFixed(2)}
                      </Text>
                    </View>
                    <Text style={styles.itemDetailTotal}>
                      ${(item.quantity * item.unit_price).toFixed(2)}
                    </Text>
                  </View>
                ))}

                <View style={styles.totalSection}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Subtotal</Text>
                    <Text style={styles.totalValue}>
                      ${selectedOrder.subtotal?.toFixed(2) || '0.00'}
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Tax</Text>
                    <Text style={styles.totalValue}>
                      ${selectedOrder.tax_amount?.toFixed(2) || '0.00'}
                    </Text>
                  </View>
                  <View style={[styles.totalRow, styles.grandTotalRow]}>
                    <Text style={styles.grandTotalLabel}>Total</Text>
                    <Text style={styles.grandTotalValue}>
                      ${selectedOrder.total_amount?.toFixed(2) || '0.00'}
                    </Text>
                  </View>
                </View>

                {/* Status Actions */}
                {getNextStatus(selectedOrder.status).length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Update Status</Text>
                    <View style={styles.statusActions}>
                      {getNextStatus(selectedOrder.status).map((status) => (
                        <Button
                          key={status}
                          title={status.charAt(0).toUpperCase() + status.slice(1)}
                          variant={status === 'cancelled' ? 'danger' : 'primary'}
                          onPress={() => handleUpdateStatus(status)}
                          style={{ flex: 1 }}
                        />
                      ))}
                    </View>
                  </>
                )}
              </ScrollView>
            )}
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
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.text,
  },
  filterContainer: {
    marginBottom: 16,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.text,
  },
  content: {
    paddingHorizontal: 20,
  },
  orderCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  orderParty: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  orderDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  orderDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderDetailText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  orderTotalLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  orderTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
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
  inputLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerOptionActive: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  pickerOptionText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  pickerOptionTextActive: {
    color: Colors.primary,
    fontWeight: '500',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addItemText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  itemRow: {
    backgroundColor: Colors.cardAlt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemProductSelect: {
    marginBottom: 12,
  },
  itemLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  productScroll: {
    flexDirection: 'row',
  },
  productChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  productChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  productChipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    maxWidth: 100,
  },
  productChipTextActive: {
    color: Colors.text,
  },
  itemInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  itemInput: {
    flex: 1,
  },
  removeItemButton: {
    padding: 12,
    marginBottom: 16,
  },
  detailSection: {
    backgroundColor: Colors.cardAlt,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  itemDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemDetailInfo: {
    flex: 1,
  },
  itemDetailName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  itemDetailMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  itemDetailTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  totalSection: {
    backgroundColor: Colors.cardAlt,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 20,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    color: Colors.text,
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 8,
    paddingTop: 12,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  statusActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
});
