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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  Card,
  Button,
  Input,
  Badge,
  ListItem,
  LoadingScreen,
  EmptyState,
} from '../../src/components/ThemedComponents';
import { useAppStore } from '../../src/store/appStore';
import { Product, ProductCategory } from '../../src/types';
import { BarcodeScanner } from '../../src/components/BarcodeScanner';
import clientConfig, { isFeatureEnabled } from '../../src/config/clientConfig';

export default function InventoryScreen() {
  const {
    products,
    inventory,
    warehouses,
    isLoading,
    fetchProducts,
    fetchInventory,
    fetchWarehouses,
    createProduct,
    updateProduct,
    deleteProduct,
    adjustInventory,
  } = useAppStore();

  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'products' | 'stock'>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');

  // Form state
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    category: 'raw' as ProductCategory,
    unit: 'pcs',
    cost_price: '',
    selling_price: '',
    reorder_level: '10',
    barcode: '',
  });

  const [adjustData, setAdjustData] = useState({
    warehouse_id: '',
    quantity: '',
    type: 'adjustment' as 'adjustment' | 'return',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([
        fetchProducts(),
        fetchInventory(),
        fetchWarehouses(),
      ]);
    } catch (error) {
      console.error('Error loading inventory:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddProduct = async () => {
    try {
      if (!formData.sku || !formData.name) {
        Alert.alert('Error', 'SKU and Name are required');
        return;
      }

      await createProduct({
        ...formData,
        cost_price: parseFloat(formData.cost_price) || 0,
        selling_price: parseFloat(formData.selling_price) || 0,
        reorder_level: parseInt(formData.reorder_level) || 10,
      });

      setShowAddModal(false);
      resetForm();
      Alert.alert('Success', 'Product created successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create product');
    }
  };

  const handleUpdateProduct = async () => {
    if (!selectedProduct) return;
    
    try {
      await updateProduct(selectedProduct.product_id, {
        name: formData.name,
        description: formData.description,
        category: formData.category,
        unit: formData.unit,
        cost_price: parseFloat(formData.cost_price) || 0,
        selling_price: parseFloat(formData.selling_price) || 0,
        reorder_level: parseInt(formData.reorder_level) || 10,
        barcode: formData.barcode,
      });

      setShowDetailModal(false);
      resetForm();
      Alert.alert('Success', 'Product updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update product');
    }
  };

  const handleDeleteProduct = (product: Product) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(product.product_id);
              setShowDetailModal(false);
              Alert.alert('Success', 'Product deleted');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete product');
            }
          },
        },
      ]
    );
  };

  const handleAdjustStock = async () => {
    if (!selectedProduct || !adjustData.warehouse_id || !adjustData.quantity) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
      await adjustInventory({
        product_id: selectedProduct.product_id,
        warehouse_id: adjustData.warehouse_id,
        type: adjustData.type,
        quantity: parseFloat(adjustData.quantity),
        notes: adjustData.notes,
      });

      setShowAdjustModal(false);
      setAdjustData({ warehouse_id: '', quantity: '', type: 'adjustment', notes: '' });
      Alert.alert('Success', 'Stock adjusted successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to adjust stock');
    }
  };

  const resetForm = () => {
    setFormData({
      sku: '',
      name: '',
      description: '',
      category: 'raw',
      unit: 'pcs',
      cost_price: '',
      selling_price: '',
      reorder_level: '10',
      barcode: '',
    });
    setSelectedProduct(null);
  };

  const openProductDetail = (product: Product) => {
    setSelectedProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      category: product.category,
      unit: product.unit,
      cost_price: product.cost_price.toString(),
      selling_price: product.selling_price.toString(),
      reorder_level: product.reorder_level.toString(),
      barcode: product.barcode || '',
    });
    setShowDetailModal(true);
  };

  const handleBarcodeProductFound = (product: any, stock: number) => {
    Alert.alert(
      'Product Found',
      `${product.name}\nSKU: ${product.sku}\nStock: ${stock} ${product.unit}`,
      [
        { text: 'View Details', onPress: () => openProductDetail(product) },
        { text: 'Adjust Stock', onPress: () => {
          setSelectedProduct(product);
          setShowAdjustModal(true);
        }},
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  const getProductStock = (productId: string) => {
    const stocks = inventory.filter((s) => s.product_id === productId);
    return stocks.reduce((sum, s) => sum + s.quantity, 0);
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category: ProductCategory) => {
    switch (category) {
      case 'raw':
        return Colors.primary;
      case 'finished':
        return Colors.success;
      case 'packaging':
        return Colors.warning;
      default:
        return Colors.textMuted;
    }
  };

  if (isLoading && products.length === 0) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <View style={styles.headerButtons}>
          {isFeatureEnabled('enableBarcodeScan') && (
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => setShowBarcodeScanner(true)}
            >
              <Ionicons name="barcode-outline" size={24} color={Colors.text} />
            </TouchableOpacity>
          )}
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
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'products' && styles.activeTab]}
          onPress={() => setActiveTab('products')}
        >
          <Text style={[styles.tabText, activeTab === 'products' && styles.activeTabText]}>
            Products
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'stock' && styles.activeTab]}
          onPress={() => setActiveTab('stock')}
        >
          <Text style={[styles.tabText, activeTab === 'stock' && styles.activeTabText]}>
            Stock Levels
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {(['all', 'raw', 'finished', 'packaging'] as const).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.filterChip,
              selectedCategory === cat && styles.filterChipActive,
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedCategory === cat && styles.filterChipTextActive,
              ]}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.content}
      >
        {activeTab === 'products' ? (
          filteredProducts.length === 0 ? (
            <EmptyState message="No products found" icon="cube-outline" />
          ) : (
            filteredProducts.map((product) => {
              const stock = getProductStock(product.product_id);
              const isLowStock = stock <= product.reorder_level;

              return (
                <TouchableOpacity
                  key={product.product_id}
                  style={styles.productCard}
                  onPress={() => openProductDetail(product)}
                  activeOpacity={0.7}
                >
                  <View style={styles.productHeader}>
                    <View
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: `${getCategoryColor(product.category)}20` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryText,
                          { color: getCategoryColor(product.category) },
                        ]}
                      >
                        {product.category.toUpperCase()}
                      </Text>
                    </View>
                    {isLowStock && <Badge text="Low Stock" variant="danger" />}
                  </View>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productSku}>SKU: {product.sku}</Text>
                  <View style={styles.productFooter}>
                    <View>
                      <Text style={styles.priceLabel}>Cost</Text>
                      <Text style={styles.priceValue}>${product.cost_price.toFixed(2)}</Text>
                    </View>
                    <View>
                      <Text style={styles.priceLabel}>Sell</Text>
                      <Text style={[styles.priceValue, { color: Colors.success }]}>
                        ${product.selling_price.toFixed(2)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.priceLabel}>Stock</Text>
                      <Text
                        style={[
                          styles.priceValue,
                          { color: isLowStock ? Colors.danger : Colors.text },
                        ]}
                      >
                        {stock} {product.unit}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )
        ) : (
          inventory.length === 0 ? (
            <EmptyState message="No stock records" icon="layers-outline" />
          ) : (
            inventory.map((stock) => (
              <Card key={stock.stock_id} style={styles.stockCard}>
                <View style={styles.stockHeader}>
                  <View>
                    <Text style={styles.stockProductName}>{stock.product_name}</Text>
                    <Text style={styles.stockSku}>SKU: {stock.product_sku}</Text>
                  </View>
                  <View style={styles.stockQuantity}>
                    <Text
                      style={[
                        styles.stockQuantityValue,
                        {
                          color:
                            stock.quantity <= (stock.reorder_level || 10)
                              ? Colors.danger
                              : Colors.success,
                        },
                      ]}
                    >
                      {stock.quantity}
                    </Text>
                    <Text style={styles.stockQuantityLabel}>units</Text>
                  </View>
                </View>
                <View style={styles.stockFooter}>
                  <View style={styles.stockWarehouse}>
                    <Ionicons name="home-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.stockWarehouseName}>{stock.warehouse_name}</Text>
                  </View>
                  <Text style={styles.stockValue}>
                    Value: ${((stock.quantity || 0) * (stock.cost_price || 0)).toFixed(2)}
                  </Text>
                </View>
              </Card>
            ))
          )
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Product Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Product</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Input
                label="SKU *"
                value={formData.sku}
                onChangeText={(text) => setFormData({ ...formData, sku: text })}
                placeholder="Enter SKU"
              />
              <Input
                label="Name *"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter product name"
              />
              <Input
                label="Description"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Enter description"
                multiline
                numberOfLines={3}
              />
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryPicker}>
                {(['raw', 'finished', 'packaging'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryOption,
                      formData.category === cat && styles.categoryOptionActive,
                    ]}
                    onPress={() => setFormData({ ...formData, category: cat })}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        formData.category === cat && styles.categoryOptionTextActive,
                      ]}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Input
                    label="Cost Price"
                    value={formData.cost_price}
                    onChangeText={(text) => setFormData({ ...formData, cost_price: text })}
                    placeholder="0.00"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfInput}>
                  <Input
                    label="Selling Price"
                    value={formData.selling_price}
                    onChangeText={(text) => setFormData({ ...formData, selling_price: text })}
                    placeholder="0.00"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Input
                    label="Unit"
                    value={formData.unit}
                    onChangeText={(text) => setFormData({ ...formData, unit: text })}
                    placeholder="pcs"
                  />
                </View>
                <View style={styles.halfInput}>
                  <Input
                    label="Reorder Level"
                    value={formData.reorder_level}
                    onChangeText={(text) => setFormData({ ...formData, reorder_level: text })}
                    placeholder="10"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Input
                label="Barcode"
                value={formData.barcode}
                onChangeText={(text) => setFormData({ ...formData, barcode: text })}
                placeholder="Enter barcode"
              />
              <Button title="Create Product" onPress={handleAddProduct} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Product Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Product</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.skuDisplay}>
                <Text style={styles.skuLabel}>SKU</Text>
                <Text style={styles.skuValue}>{formData.sku}</Text>
              </View>
              <Input
                label="Name *"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter product name"
              />
              <Input
                label="Description"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Enter description"
                multiline
                numberOfLines={3}
              />
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryPicker}>
                {(['raw', 'finished', 'packaging'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryOption,
                      formData.category === cat && styles.categoryOptionActive,
                    ]}
                    onPress={() => setFormData({ ...formData, category: cat })}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        formData.category === cat && styles.categoryOptionTextActive,
                      ]}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Input
                    label="Cost Price"
                    value={formData.cost_price}
                    onChangeText={(text) => setFormData({ ...formData, cost_price: text })}
                    placeholder="0.00"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfInput}>
                  <Input
                    label="Selling Price"
                    value={formData.selling_price}
                    onChangeText={(text) => setFormData({ ...formData, selling_price: text })}
                    placeholder="0.00"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Input
                    label="Unit"
                    value={formData.unit}
                    onChangeText={(text) => setFormData({ ...formData, unit: text })}
                    placeholder="pcs"
                  />
                </View>
                <View style={styles.halfInput}>
                  <Input
                    label="Reorder Level"
                    value={formData.reorder_level}
                    onChangeText={(text) => setFormData({ ...formData, reorder_level: text })}
                    placeholder="10"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Input
                label="Barcode"
                value={formData.barcode}
                onChangeText={(text) => setFormData({ ...formData, barcode: text })}
                placeholder="Enter barcode"
              />
              <Button title="Update Product" onPress={handleUpdateProduct} style={{ marginTop: 16 }} />
              <Button
                title="Adjust Stock"
                variant="outline"
                onPress={() => {
                  setShowDetailModal(false);
                  setShowAdjustModal(true);
                }}
                style={{ marginTop: 12 }}
              />
              <Button
                title="Delete Product"
                variant="danger"
                onPress={() => selectedProduct && handleDeleteProduct(selectedProduct)}
                style={{ marginTop: 12 }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal visible={showAdjustModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adjust Stock</Text>
              <TouchableOpacity onPress={() => setShowAdjustModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedProduct && (
                <View style={styles.selectedProductInfo}>
                  <Text style={styles.selectedProductName}>{selectedProduct.name}</Text>
                  <Text style={styles.selectedProductSku}>SKU: {selectedProduct.sku}</Text>
                </View>
              )}
              <Text style={styles.inputLabel}>Warehouse *</Text>
              <View style={styles.warehousePicker}>
                {warehouses.map((wh) => (
                  <TouchableOpacity
                    key={wh.warehouse_id}
                    style={[
                      styles.warehouseOption,
                      adjustData.warehouse_id === wh.warehouse_id && styles.warehouseOptionActive,
                    ]}
                    onPress={() => setAdjustData({ ...adjustData, warehouse_id: wh.warehouse_id })}
                  >
                    <Ionicons
                      name="home-outline"
                      size={18}
                      color={
                        adjustData.warehouse_id === wh.warehouse_id
                          ? Colors.primary
                          : Colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.warehouseOptionText,
                        adjustData.warehouse_id === wh.warehouse_id && styles.warehouseOptionTextActive,
                      ]}
                    >
                      {wh.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>Adjustment Type</Text>
              <View style={styles.adjustTypePicker}>
                {(['adjustment', 'return'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.adjustTypeOption,
                      adjustData.type === type && styles.adjustTypeOptionActive,
                    ]}
                    onPress={() => setAdjustData({ ...adjustData, type })}
                  >
                    <Text
                      style={[
                        styles.adjustTypeOptionText,
                        adjustData.type === type && styles.adjustTypeOptionTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Input
                label="Quantity * (use negative for decrease)"
                value={adjustData.quantity}
                onChangeText={(text) => setAdjustData({ ...adjustData, quantity: text })}
                placeholder="Enter quantity"
                keyboardType="numeric"
              />
              <Input
                label="Notes"
                value={adjustData.notes}
                onChangeText={(text) => setAdjustData({ ...adjustData, notes: text })}
                placeholder="Enter notes"
                multiline
                numberOfLines={3}
              />
              <Button title="Adjust Stock" onPress={handleAdjustStock} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Barcode Scanner */}
      {isFeatureEnabled('enableBarcodeScan') && (
        <BarcodeScanner
          visible={showBarcodeScanner}
          onClose={() => setShowBarcodeScanner(false)}
          onProductFound={handleBarcodeProductFound}
        />
      )}
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
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.cardAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.card,
    alignItems: 'center',
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
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    color: Colors.text,
    fontSize: 16,
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
  productCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  productSku: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  priceLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  stockCard: {
    marginBottom: 12,
  },
  stockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stockProductName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  stockSku: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  stockQuantity: {
    alignItems: 'flex-end',
  },
  stockQuantityValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  stockQuantityLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  stockFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stockWarehouse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockWarehouseName: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  stockValue: {
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
  inputLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  categoryPicker: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  categoryOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.cardAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  categoryOptionTextActive: {
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  skuDisplay: {
    backgroundColor: Colors.cardAlt,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  skuLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  skuValue: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  selectedProductInfo: {
    backgroundColor: Colors.cardAlt,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  selectedProductName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  selectedProductSku: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  warehousePicker: {
    gap: 8,
    marginBottom: 16,
  },
  warehouseOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  warehouseOptionActive: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  warehouseOptionText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  warehouseOptionTextActive: {
    color: Colors.primary,
    fontWeight: '500',
  },
  adjustTypePicker: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  adjustTypeOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.cardAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adjustTypeOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  adjustTypeOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  adjustTypeOptionTextActive: {
    color: Colors.text,
  },
});
