from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from enum import Enum
import io
import base64

# PDF Generation imports
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'bizcore_db')]

# Create the main app
app = FastAPI(title="BizCore API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========================
# ENUMS
# ========================

class ProductCategory(str, Enum):
    RAW = "raw"
    FINISHED = "finished"
    PACKAGING = "packaging"

class TransactionType(str, Enum):
    PURCHASE = "purchase"
    SALE = "sale"
    PRODUCTION = "production"
    ADJUSTMENT = "adjustment"
    RETURN = "return"

class OrderStatus(str, Enum):
    DRAFT = "draft"
    ORDERED = "ordered"
    RECEIVED = "received"
    CANCELLED = "cancelled"
    PAID = "paid"
    PARTIAL = "partial"
    DELIVERED = "delivered"

class InvoiceType(str, Enum):
    PURCHASE = "purchase"
    SALE = "sale"

class InvoiceStatus(str, Enum):
    UNPAID = "unpaid"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"

class PaymentMethod(str, Enum):
    CASH = "cash"
    BANK = "bank"
    UPI = "upi"
    CARD = "card"

class AccountType(str, Enum):
    ASSET = "asset"
    LIABILITY = "liability"
    INCOME = "income"
    EXPENSE = "expense"
    EQUITY = "equity"

class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    MANAGER = "manager"
    PURCHASE_CLERK = "purchase_clerk"
    SALES_EXECUTIVE = "sales_executive"
    ACCOUNTANT = "accountant"
    VIEWER = "viewer"

class RequisitionStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CONVERTED = "converted"

class GRNStatus(str, Enum):
    PENDING = "pending"
    RECEIVED = "received"
    PARTIAL = "partial"
    REJECTED = "rejected"

class MatchingStatus(str, Enum):
    UNMATCHED = "unmatched"
    PARTIAL_MATCH = "partial_match"
    FULL_MATCH = "full_match"
    DISCREPANCY = "discrepancy"

# ========================
# PYDANTIC MODELS
# ========================

# Auth Models
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: UserRole = UserRole.VIEWER
    company_id: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

# Company Model
class Company(BaseModel):
    company_id: str = Field(default_factory=lambda: f"comp_{uuid.uuid4().hex[:12]}")
    name: str
    address: Optional[str] = None
    tax_id: Optional[str] = None
    logo_url: Optional[str] = None
    currency: str = "USD"
    fiscal_year_start: int = 1  # Month (1-12)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CompanyCreate(BaseModel):
    name: str
    address: Optional[str] = None
    tax_id: Optional[str] = None
    currency: str = "USD"

# Warehouse Model
class Warehouse(BaseModel):
    warehouse_id: str = Field(default_factory=lambda: f"wh_{uuid.uuid4().hex[:12]}")
    name: str
    address: Optional[str] = None
    capacity: Optional[float] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WarehouseCreate(BaseModel):
    name: str
    address: Optional[str] = None
    capacity: Optional[float] = None

# Product Model
class Product(BaseModel):
    product_id: str = Field(default_factory=lambda: f"prod_{uuid.uuid4().hex[:12]}")
    sku: str
    name: str
    description: Optional[str] = None
    category: ProductCategory = ProductCategory.RAW
    unit: str = "pcs"
    cost_price: float = 0.0
    selling_price: float = 0.0
    reorder_level: int = 10
    min_stock: int = 0
    max_stock: int = 1000
    expiry_days: Optional[int] = None
    barcode: Optional[str] = None
    image_url: Optional[str] = None
    default_supplier_id: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: ProductCategory = ProductCategory.RAW
    unit: str = "pcs"
    cost_price: float = 0.0
    selling_price: float = 0.0
    reorder_level: int = 10
    min_stock: int = 0
    max_stock: int = 1000
    expiry_days: Optional[int] = None
    barcode: Optional[str] = None
    image_url: Optional[str] = None
    default_supplier_id: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[ProductCategory] = None
    unit: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    reorder_level: Optional[int] = None
    min_stock: Optional[int] = None
    max_stock: Optional[int] = None
    expiry_days: Optional[int] = None
    barcode: Optional[str] = None
    image_url: Optional[str] = None
    default_supplier_id: Optional[str] = None
    is_active: Optional[bool] = None

# Inventory Stock Model
class InventoryStock(BaseModel):
    stock_id: str = Field(default_factory=lambda: f"stock_{uuid.uuid4().hex[:12]}")
    product_id: str
    warehouse_id: str
    quantity: float = 0.0
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Stock Transaction Model
class StockTransaction(BaseModel):
    transaction_id: str = Field(default_factory=lambda: f"txn_{uuid.uuid4().hex[:12]}")
    product_id: str
    warehouse_id: str
    type: TransactionType
    quantity: float
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StockTransactionCreate(BaseModel):
    product_id: str
    warehouse_id: str
    type: TransactionType
    quantity: float
    reference_id: Optional[str] = None
    notes: Optional[str] = None

# Supplier Model
class Supplier(BaseModel):
    supplier_id: str = Field(default_factory=lambda: f"sup_{uuid.uuid4().hex[:12]}")
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payment_terms_days: int = 30
    tax_id: Optional[str] = None
    rating: float = 0.0
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SupplierCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payment_terms_days: int = 30
    tax_id: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payment_terms_days: Optional[int] = None
    tax_id: Optional[str] = None
    rating: Optional[float] = None
    is_active: Optional[bool] = None

# Distributor Model
class Distributor(BaseModel):
    distributor_id: str = Field(default_factory=lambda: f"dist_{uuid.uuid4().hex[:12]}")
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    territory: Optional[str] = None
    commission_percent: float = 0.0
    credit_limit: float = 0.0
    outstanding: float = 0.0
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DistributorCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    territory: Optional[str] = None
    commission_percent: float = 0.0
    credit_limit: float = 0.0

class DistributorUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    territory: Optional[str] = None
    commission_percent: Optional[float] = None
    credit_limit: Optional[float] = None
    is_active: Optional[bool] = None

# Purchase Order Models
class PurchaseOrderItem(BaseModel):
    item_id: str = Field(default_factory=lambda: f"poi_{uuid.uuid4().hex[:12]}")
    product_id: str
    product_name: Optional[str] = None
    quantity: float
    unit_price: float
    received_quantity: float = 0.0

class PurchaseOrder(BaseModel):
    po_id: str = Field(default_factory=lambda: f"po_{uuid.uuid4().hex[:12]}")
    po_number: str
    supplier_id: str
    supplier_name: Optional[str] = None
    warehouse_id: str
    order_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expected_date: Optional[datetime] = None
    status: OrderStatus = OrderStatus.DRAFT
    items: List[PurchaseOrderItem] = []
    subtotal: float = 0.0
    tax_amount: float = 0.0
    total_amount: float = 0.0
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PurchaseOrderItemCreate(BaseModel):
    product_id: str
    quantity: float
    unit_price: float

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    warehouse_id: str
    expected_date: Optional[datetime] = None
    items: List[PurchaseOrderItemCreate] = []
    tax_amount: float = 0.0
    notes: Optional[str] = None

class PurchaseOrderUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    expected_date: Optional[datetime] = None
    notes: Optional[str] = None

# Purchase Requisition Models
class RequisitionItem(BaseModel):
    item_id: str = Field(default_factory=lambda: f"ri_{uuid.uuid4().hex[:12]}")
    product_id: str
    product_name: Optional[str] = None
    quantity: float
    estimated_unit_price: float = 0.0
    reason: Optional[str] = None

class PurchaseRequisition(BaseModel):
    requisition_id: str = Field(default_factory=lambda: f"req_{uuid.uuid4().hex[:12]}")
    requisition_number: str
    requested_by: str
    requested_by_name: Optional[str] = None
    department: Optional[str] = None
    priority: str = "normal"  # low, normal, high, urgent
    required_date: Optional[datetime] = None
    status: RequisitionStatus = RequisitionStatus.DRAFT
    items: List[RequisitionItem] = []
    total_estimated: float = 0.0
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    converted_po_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RequisitionItemCreate(BaseModel):
    product_id: str
    quantity: float
    estimated_unit_price: float = 0.0
    reason: Optional[str] = None

class PurchaseRequisitionCreate(BaseModel):
    department: Optional[str] = None
    priority: str = "normal"
    required_date: Optional[datetime] = None
    items: List[RequisitionItemCreate] = []
    notes: Optional[str] = None

# Goods Receipt Note (GRN) Models
class GRNItem(BaseModel):
    item_id: str = Field(default_factory=lambda: f"grni_{uuid.uuid4().hex[:12]}")
    po_item_id: str
    product_id: str
    product_name: Optional[str] = None
    ordered_quantity: float
    received_quantity: float
    accepted_quantity: float
    rejected_quantity: float = 0.0
    rejection_reason: Optional[str] = None
    unit_price: float

class GoodsReceiptNote(BaseModel):
    grn_id: str = Field(default_factory=lambda: f"grn_{uuid.uuid4().hex[:12]}")
    grn_number: str
    po_id: str
    po_number: str
    supplier_id: str
    supplier_name: Optional[str] = None
    warehouse_id: str
    received_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: GRNStatus = GRNStatus.PENDING
    items: List[GRNItem] = []
    total_amount: float = 0.0
    received_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GRNItemCreate(BaseModel):
    po_item_id: str
    product_id: str
    received_quantity: float
    accepted_quantity: float
    rejected_quantity: float = 0.0
    rejection_reason: Optional[str] = None

class GRNCreate(BaseModel):
    po_id: str
    warehouse_id: str
    items: List[GRNItemCreate] = []
    notes: Optional[str] = None

# 3-Way Matching Model
class ThreeWayMatch(BaseModel):
    match_id: str = Field(default_factory=lambda: f"match_{uuid.uuid4().hex[:12]}")
    po_id: str
    po_number: str
    grn_id: str
    grn_number: str
    invoice_id: str
    invoice_number: str
    supplier_id: str
    supplier_name: Optional[str] = None
    status: MatchingStatus = MatchingStatus.UNMATCHED
    po_total: float = 0.0
    grn_total: float = 0.0
    invoice_total: float = 0.0
    variance: float = 0.0
    variance_percent: float = 0.0
    discrepancies: List[dict] = []
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Sales Order Models
class SalesOrderItem(BaseModel):
    item_id: str = Field(default_factory=lambda: f"soi_{uuid.uuid4().hex[:12]}")
    product_id: str
    product_name: Optional[str] = None
    quantity: float
    unit_price: float
    delivered_quantity: float = 0.0

class SalesOrder(BaseModel):
    so_id: str = Field(default_factory=lambda: f"so_{uuid.uuid4().hex[:12]}")
    so_number: str
    distributor_id: str
    distributor_name: Optional[str] = None
    warehouse_id: str
    order_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    delivery_date: Optional[datetime] = None
    status: OrderStatus = OrderStatus.DRAFT
    items: List[SalesOrderItem] = []
    subtotal: float = 0.0
    tax_amount: float = 0.0
    total_amount: float = 0.0
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SalesOrderItemCreate(BaseModel):
    product_id: str
    quantity: float
    unit_price: float

class SalesOrderCreate(BaseModel):
    distributor_id: str
    warehouse_id: str
    delivery_date: Optional[datetime] = None
    items: List[SalesOrderItemCreate] = []
    tax_amount: float = 0.0
    notes: Optional[str] = None

class SalesOrderUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    delivery_date: Optional[datetime] = None
    notes: Optional[str] = None

# Invoice Model
class Invoice(BaseModel):
    invoice_id: str = Field(default_factory=lambda: f"inv_{uuid.uuid4().hex[:12]}")
    invoice_number: str
    type: InvoiceType
    reference_id: str  # PO or SO id
    party_id: str  # Supplier or Distributor id
    party_name: Optional[str] = None
    issue_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_date: datetime
    subtotal: float = 0.0
    tax_amount: float = 0.0
    total: float = 0.0
    paid_amount: float = 0.0
    status: InvoiceStatus = InvoiceStatus.UNPAID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InvoiceCreate(BaseModel):
    type: InvoiceType
    reference_id: str
    party_id: str
    due_date: datetime
    subtotal: float
    tax_amount: float = 0.0

# Payment Model
class Payment(BaseModel):
    payment_id: str = Field(default_factory=lambda: f"pay_{uuid.uuid4().hex[:12]}")
    invoice_id: str
    amount: float
    payment_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    method: PaymentMethod = PaymentMethod.CASH
    transaction_ref: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PaymentCreate(BaseModel):
    invoice_id: str
    amount: float
    method: PaymentMethod = PaymentMethod.CASH
    transaction_ref: Optional[str] = None
    notes: Optional[str] = None

# Chart of Accounts Model
class ChartOfAccount(BaseModel):
    account_id: str = Field(default_factory=lambda: f"acc_{uuid.uuid4().hex[:12]}")
    code: str
    name: str
    type: AccountType
    parent_id: Optional[str] = None
    balance: float = 0.0
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChartOfAccountCreate(BaseModel):
    code: str
    name: str
    type: AccountType
    parent_id: Optional[str] = None

# Notification Model
class Notification(BaseModel):
    notification_id: str = Field(default_factory=lambda: f"notif_{uuid.uuid4().hex[:12]}")
    user_id: str
    title: str
    message: str
    type: str = "info"
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Audit Log Model
class AuditLog(BaseModel):
    log_id: str = Field(default_factory=lambda: f"log_{uuid.uuid4().hex[:12]}")
    user_id: str
    action: str
    entity_type: str
    entity_id: str
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Dashboard Models
class DashboardStats(BaseModel):
    total_inventory_value: float = 0.0
    low_stock_count: int = 0
    today_sales: float = 0.0
    today_purchases: float = 0.0
    cash_balance: float = 0.0
    pending_invoices: int = 0
    total_products: int = 0
    total_suppliers: int = 0
    total_distributors: int = 0
    total_warehouses: int = 0

# ========================
# AUTHENTICATION HELPERS
# ========================

async def get_current_user(request: Request) -> User:
    """Get current user from session token"""
    session_token = request.cookies.get("session_token")
    
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user)

async def get_optional_user(request: Request) -> Optional[User]:
    """Get current user if authenticated, None otherwise"""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

# ========================
# AUTH ENDPOINTS
# ========================

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        
        data = resp.json()
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing_user = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": data["name"],
                "picture": data.get("picture"),
                "updated_at": datetime.now(timezone.utc)
            }}
        )
    else:
        user_doc = {
            "user_id": user_id,
            "email": data["email"],
            "name": data["name"],
            "picture": data.get("picture"),
            "role": UserRole.VIEWER.value,
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(user_doc)
    
    session_token = data.get("session_token", f"sess_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {**user, "session_token": session_token}

@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current user info"""
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ========================
# USER MANAGEMENT ENDPOINTS
# ========================

@api_router.get("/users", response_model=List[User])
async def get_users(user: User = Depends(get_current_user)):
    """Get all users (admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return [User(**u) for u in users]

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, update: UserUpdate, user: User = Depends(get_current_user)):
    """Update user (admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.users.update_one({"user_id": user_id}, {"$set": update_data})
    
    updated_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return User(**updated_user)

# ========================
# COMPANY ENDPOINTS
# ========================

@api_router.get("/company")
async def get_company(user: User = Depends(get_current_user)):
    """Get company info"""
    company = await db.companies.find_one({}, {"_id": 0})
    if not company:
        default_company = Company(
            name="My Company",
            currency="USD"
        )
        await db.companies.insert_one(default_company.model_dump())
        return default_company
    return company

@api_router.put("/company")
async def update_company(company_data: CompanyCreate, user: User = Depends(get_current_user)):
    """Update company info (admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    existing = await db.companies.find_one({}, {"_id": 0})
    if existing:
        await db.companies.update_one({}, {"$set": company_data.model_dump()})
    else:
        company = Company(**company_data.model_dump())
        await db.companies.insert_one(company.model_dump())
    
    return await db.companies.find_one({}, {"_id": 0})

# ========================
# WAREHOUSE ENDPOINTS
# ========================

@api_router.get("/warehouses", response_model=List[Warehouse])
async def get_warehouses(user: User = Depends(get_current_user)):
    """Get all warehouses"""
    warehouses = await db.warehouses.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return [Warehouse(**w) for w in warehouses]

@api_router.post("/warehouses", response_model=Warehouse)
async def create_warehouse(warehouse: WarehouseCreate, user: User = Depends(get_current_user)):
    """Create a warehouse"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    new_warehouse = Warehouse(**warehouse.model_dump())
    await db.warehouses.insert_one(new_warehouse.model_dump())
    return new_warehouse

@api_router.put("/warehouses/{warehouse_id}", response_model=Warehouse)
async def update_warehouse(warehouse_id: str, warehouse: WarehouseCreate, user: User = Depends(get_current_user)):
    """Update a warehouse"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.warehouses.update_one(
        {"warehouse_id": warehouse_id},
        {"$set": warehouse.model_dump()}
    )
    updated = await db.warehouses.find_one({"warehouse_id": warehouse_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return Warehouse(**updated)

@api_router.delete("/warehouses/{warehouse_id}")
async def delete_warehouse(warehouse_id: str, user: User = Depends(get_current_user)):
    """Delete a warehouse (soft delete)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.warehouses.update_one(
        {"warehouse_id": warehouse_id},
        {"$set": {"is_active": False}}
    )
    return {"message": "Warehouse deleted"}

# ========================
# PRODUCT ENDPOINTS
# ========================

@api_router.get("/products", response_model=List[Product])
async def get_products(
    category: Optional[ProductCategory] = None,
    supplier_id: Optional[str] = None,
    low_stock: bool = False,
    user: User = Depends(get_current_user)
):
    """Get all products with optional filters"""
    query = {"is_active": True}
    if category:
        query["category"] = category.value
    if supplier_id:
        query["default_supplier_id"] = supplier_id
    
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    result = [Product(**p) for p in products]
    
    if low_stock:
        result = [p for p in result if await is_low_stock(p.product_id, p.reorder_level)]
    
    return result

async def is_low_stock(product_id: str, reorder_level: int) -> bool:
    """Check if product is low on stock"""
    stocks = await db.inventory_stock.find({"product_id": product_id}, {"_id": 0}).to_list(100)
    total_qty = sum(s.get("quantity", 0) for s in stocks)
    return total_qty <= reorder_level

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str, user: User = Depends(get_current_user)):
    """Get a single product"""
    product = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**product)

@api_router.post("/products", response_model=Product)
async def create_product(product: ProductCreate, user: User = Depends(get_current_user)):
    """Create a product"""
    existing = await db.products.find_one({"sku": product.sku}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    new_product = Product(**product.model_dump())
    await db.products.insert_one(new_product.model_dump())
    return new_product

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, update: ProductUpdate, user: User = Depends(get_current_user)):
    """Update a product"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.products.update_one({"product_id": product_id}, {"$set": update_data})
    
    product = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**product)

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: User = Depends(get_current_user)):
    """Delete a product (soft delete)"""
    await db.products.update_one(
        {"product_id": product_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"message": "Product deleted"}

# ========================
# INVENTORY ENDPOINTS
# ========================

@api_router.get("/inventory")
async def get_inventory(
    warehouse_id: Optional[str] = None,
    product_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get inventory stock levels"""
    query = {}
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    if product_id:
        query["product_id"] = product_id
    
    stocks = await db.inventory_stock.find(query, {"_id": 0}).to_list(1000)
    
    # Enrich with product info
    result = []
    for stock in stocks:
        product = await db.products.find_one({"product_id": stock["product_id"]}, {"_id": 0})
        warehouse = await db.warehouses.find_one({"warehouse_id": stock["warehouse_id"]}, {"_id": 0})
        stock["product_name"] = product["name"] if product else "Unknown"
        stock["product_sku"] = product["sku"] if product else "Unknown"
        stock["warehouse_name"] = warehouse["name"] if warehouse else "Unknown"
        stock["cost_price"] = product["cost_price"] if product else 0
        stock["reorder_level"] = product["reorder_level"] if product else 0
        result.append(stock)
    
    return result

@api_router.post("/inventory/adjust")
async def adjust_inventory(adjustment: StockTransactionCreate, user: User = Depends(get_current_user)):
    """Adjust inventory (damage, return, conversion)"""
    # Find or create stock record
    stock = await db.inventory_stock.find_one({
        "product_id": adjustment.product_id,
        "warehouse_id": adjustment.warehouse_id
    }, {"_id": 0})
    
    if stock:
        new_qty = stock["quantity"] + adjustment.quantity
        await db.inventory_stock.update_one(
            {"stock_id": stock["stock_id"]},
            {"$set": {"quantity": new_qty, "last_updated": datetime.now(timezone.utc)}}
        )
    else:
        new_stock = InventoryStock(
            product_id=adjustment.product_id,
            warehouse_id=adjustment.warehouse_id,
            quantity=adjustment.quantity
        )
        await db.inventory_stock.insert_one(new_stock.model_dump())
    
    # Record transaction
    transaction = StockTransaction(
        **adjustment.model_dump(),
        created_by=user.user_id
    )
    await db.stock_transactions.insert_one(transaction.model_dump())
    
    return {"message": "Inventory adjusted", "transaction_id": transaction.transaction_id}

@api_router.get("/inventory/transactions")
async def get_stock_transactions(
    product_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    limit: int = 100,
    user: User = Depends(get_current_user)
):
    """Get stock transaction history"""
    query = {}
    if product_id:
        query["product_id"] = product_id
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    
    transactions = await db.stock_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return transactions

@api_router.get("/inventory/low-stock")
async def get_low_stock_items(user: User = Depends(get_current_user)):
    """Get products that are low on stock"""
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(1000)
    low_stock_items = []
    
    for product in products:
        stocks = await db.inventory_stock.find({"product_id": product["product_id"]}, {"_id": 0}).to_list(100)
        total_qty = sum(s.get("quantity", 0) for s in stocks)
        if total_qty <= product.get("reorder_level", 10):
            low_stock_items.append({
                "product_id": product["product_id"],
                "name": product["name"],
                "sku": product["sku"],
                "current_stock": total_qty,
                "reorder_level": product.get("reorder_level", 10)
            })
    
    return low_stock_items

# ========================
# SUPPLIER ENDPOINTS
# ========================

@api_router.get("/suppliers", response_model=List[Supplier])
async def get_suppliers(user: User = Depends(get_current_user)):
    """Get all suppliers"""
    suppliers = await db.suppliers.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return [Supplier(**s) for s in suppliers]

@api_router.get("/suppliers/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str, user: User = Depends(get_current_user)):
    """Get a single supplier"""
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return Supplier(**supplier)

@api_router.post("/suppliers", response_model=Supplier)
async def create_supplier(supplier: SupplierCreate, user: User = Depends(get_current_user)):
    """Create a supplier"""
    new_supplier = Supplier(**supplier.model_dump())
    await db.suppliers.insert_one(new_supplier.model_dump())
    return new_supplier

@api_router.put("/suppliers/{supplier_id}", response_model=Supplier)
async def update_supplier(supplier_id: str, update: SupplierUpdate, user: User = Depends(get_current_user)):
    """Update a supplier"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.suppliers.update_one({"supplier_id": supplier_id}, {"$set": update_data})
    
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return Supplier(**supplier)

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user: User = Depends(get_current_user)):
    """Delete a supplier (soft delete)"""
    await db.suppliers.update_one(
        {"supplier_id": supplier_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"message": "Supplier deleted"}

# ========================
# DISTRIBUTOR ENDPOINTS
# ========================

@api_router.get("/distributors", response_model=List[Distributor])
async def get_distributors(user: User = Depends(get_current_user)):
    """Get all distributors"""
    distributors = await db.distributors.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return [Distributor(**d) for d in distributors]

@api_router.get("/distributors/{distributor_id}", response_model=Distributor)
async def get_distributor(distributor_id: str, user: User = Depends(get_current_user)):
    """Get a single distributor"""
    distributor = await db.distributors.find_one({"distributor_id": distributor_id}, {"_id": 0})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    return Distributor(**distributor)

@api_router.post("/distributors", response_model=Distributor)
async def create_distributor(distributor: DistributorCreate, user: User = Depends(get_current_user)):
    """Create a distributor"""
    new_distributor = Distributor(**distributor.model_dump())
    await db.distributors.insert_one(new_distributor.model_dump())
    return new_distributor

@api_router.put("/distributors/{distributor_id}", response_model=Distributor)
async def update_distributor(distributor_id: str, update: DistributorUpdate, user: User = Depends(get_current_user)):
    """Update a distributor"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.distributors.update_one({"distributor_id": distributor_id}, {"$set": update_data})
    
    distributor = await db.distributors.find_one({"distributor_id": distributor_id}, {"_id": 0})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    return Distributor(**distributor)

@api_router.delete("/distributors/{distributor_id}")
async def delete_distributor(distributor_id: str, user: User = Depends(get_current_user)):
    """Delete a distributor (soft delete)"""
    await db.distributors.update_one(
        {"distributor_id": distributor_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"message": "Distributor deleted"}

# ========================
# PURCHASE ORDER ENDPOINTS
# ========================

async def generate_po_number():
    """Generate unique PO number"""
    count = await db.purchase_orders.count_documents({})
    return f"PO-{datetime.now().strftime('%Y%m')}-{count + 1:04d}"

@api_router.get("/purchase-orders")
async def get_purchase_orders(
    status: Optional[OrderStatus] = None,
    supplier_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all purchase orders"""
    query = {}
    if status:
        query["status"] = status.value
    if supplier_id:
        query["supplier_id"] = supplier_id
    
    orders = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@api_router.get("/purchase-orders/{po_id}")
async def get_purchase_order(po_id: str, user: User = Depends(get_current_user)):
    """Get a single purchase order"""
    po = await db.purchase_orders.find_one({"po_id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po

@api_router.post("/purchase-orders")
async def create_purchase_order(po_data: PurchaseOrderCreate, user: User = Depends(get_current_user)):
    """Create a purchase order"""
    supplier = await db.suppliers.find_one({"supplier_id": po_data.supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Build items with product names
    items = []
    subtotal = 0.0
    for item in po_data.items:
        product = await db.products.find_one({"product_id": item.product_id}, {"_id": 0})
        po_item = PurchaseOrderItem(
            product_id=item.product_id,
            product_name=product["name"] if product else "Unknown",
            quantity=item.quantity,
            unit_price=item.unit_price
        )
        items.append(po_item.model_dump())
        subtotal += item.quantity * item.unit_price
    
    po = PurchaseOrder(
        po_number=await generate_po_number(),
        supplier_id=po_data.supplier_id,
        supplier_name=supplier["name"],
        warehouse_id=po_data.warehouse_id,
        expected_date=po_data.expected_date,
        items=items,
        subtotal=subtotal,
        tax_amount=po_data.tax_amount,
        total_amount=subtotal + po_data.tax_amount,
        notes=po_data.notes,
        created_by=user.user_id
    )
    
    await db.purchase_orders.insert_one(po.model_dump())
    return po.model_dump()

@api_router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, update: PurchaseOrderUpdate, user: User = Depends(get_current_user)):
    """Update a purchase order"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        # Handle status change to "received"
        if update.status == OrderStatus.RECEIVED:
            po = await db.purchase_orders.find_one({"po_id": po_id}, {"_id": 0})
            if po:
                for item in po.get("items", []):
                    # Update inventory
                    stock = await db.inventory_stock.find_one({
                        "product_id": item["product_id"],
                        "warehouse_id": po["warehouse_id"]
                    }, {"_id": 0})
                    
                    if stock:
                        new_qty = stock["quantity"] + item["quantity"]
                        await db.inventory_stock.update_one(
                            {"stock_id": stock["stock_id"]},
                            {"$set": {"quantity": new_qty, "last_updated": datetime.now(timezone.utc)}}
                        )
                    else:
                        new_stock = InventoryStock(
                            product_id=item["product_id"],
                            warehouse_id=po["warehouse_id"],
                            quantity=item["quantity"]
                        )
                        await db.inventory_stock.insert_one(new_stock.model_dump())
                    
                    # Record transaction
                    transaction = StockTransaction(
                        product_id=item["product_id"],
                        warehouse_id=po["warehouse_id"],
                        type=TransactionType.PURCHASE,
                        quantity=item["quantity"],
                        reference_id=po_id,
                        created_by=user.user_id
                    )
                    await db.stock_transactions.insert_one(transaction.model_dump())
        
        await db.purchase_orders.update_one({"po_id": po_id}, {"$set": update_data})
    
    return await db.purchase_orders.find_one({"po_id": po_id}, {"_id": 0})

@api_router.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str, user: User = Depends(get_current_user)):
    """Cancel a purchase order"""
    po = await db.purchase_orders.find_one({"po_id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    if po["status"] != OrderStatus.DRAFT.value:
        raise HTTPException(status_code=400, detail="Can only cancel draft orders")
    
    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": {"status": OrderStatus.CANCELLED.value, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"message": "Purchase order cancelled"}

# ========================
# SALES ORDER ENDPOINTS
# ========================

async def generate_so_number():
    """Generate unique SO number"""
    count = await db.sales_orders.count_documents({})
    return f"SO-{datetime.now().strftime('%Y%m')}-{count + 1:04d}"

@api_router.get("/sales-orders")
async def get_sales_orders(
    status: Optional[OrderStatus] = None,
    distributor_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all sales orders"""
    query = {}
    if status:
        query["status"] = status.value
    if distributor_id:
        query["distributor_id"] = distributor_id
    
    orders = await db.sales_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@api_router.get("/sales-orders/{so_id}")
async def get_sales_order(so_id: str, user: User = Depends(get_current_user)):
    """Get a single sales order"""
    so = await db.sales_orders.find_one({"so_id": so_id}, {"_id": 0})
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    return so

@api_router.post("/sales-orders")
async def create_sales_order(so_data: SalesOrderCreate, user: User = Depends(get_current_user)):
    """Create a sales order"""
    distributor = await db.distributors.find_one({"distributor_id": so_data.distributor_id}, {"_id": 0})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Build items with product names
    items = []
    subtotal = 0.0
    for item in so_data.items:
        product = await db.products.find_one({"product_id": item.product_id}, {"_id": 0})
        so_item = SalesOrderItem(
            product_id=item.product_id,
            product_name=product["name"] if product else "Unknown",
            quantity=item.quantity,
            unit_price=item.unit_price
        )
        items.append(so_item.model_dump())
        subtotal += item.quantity * item.unit_price
    
    so = SalesOrder(
        so_number=await generate_so_number(),
        distributor_id=so_data.distributor_id,
        distributor_name=distributor["name"],
        warehouse_id=so_data.warehouse_id,
        delivery_date=so_data.delivery_date,
        items=items,
        subtotal=subtotal,
        tax_amount=so_data.tax_amount,
        total_amount=subtotal + so_data.tax_amount,
        notes=so_data.notes,
        created_by=user.user_id
    )
    
    await db.sales_orders.insert_one(so.model_dump())
    return so.model_dump()

@api_router.put("/sales-orders/{so_id}")
async def update_sales_order(so_id: str, update: SalesOrderUpdate, user: User = Depends(get_current_user)):
    """Update a sales order"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        # Handle status change to "delivered"
        if update.status == OrderStatus.DELIVERED:
            so = await db.sales_orders.find_one({"so_id": so_id}, {"_id": 0})
            if so:
                for item in so.get("items", []):
                    # Update inventory (reduce stock)
                    stock = await db.inventory_stock.find_one({
                        "product_id": item["product_id"],
                        "warehouse_id": so["warehouse_id"]
                    }, {"_id": 0})
                    
                    if stock:
                        new_qty = stock["quantity"] - item["quantity"]
                        await db.inventory_stock.update_one(
                            {"stock_id": stock["stock_id"]},
                            {"$set": {"quantity": max(0, new_qty), "last_updated": datetime.now(timezone.utc)}}
                        )
                    
                    # Record transaction
                    transaction = StockTransaction(
                        product_id=item["product_id"],
                        warehouse_id=so["warehouse_id"],
                        type=TransactionType.SALE,
                        quantity=-item["quantity"],
                        reference_id=so_id,
                        created_by=user.user_id
                    )
                    await db.stock_transactions.insert_one(transaction.model_dump())
        
        await db.sales_orders.update_one({"so_id": so_id}, {"$set": update_data})
    
    return await db.sales_orders.find_one({"so_id": so_id}, {"_id": 0})

@api_router.delete("/sales-orders/{so_id}")
async def delete_sales_order(so_id: str, user: User = Depends(get_current_user)):
    """Cancel a sales order"""
    so = await db.sales_orders.find_one({"so_id": so_id}, {"_id": 0})
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    
    if so["status"] != OrderStatus.DRAFT.value:
        raise HTTPException(status_code=400, detail="Can only cancel draft orders")
    
    await db.sales_orders.update_one(
        {"so_id": so_id},
        {"$set": {"status": OrderStatus.CANCELLED.value, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"message": "Sales order cancelled"}

# ========================
# INVOICE ENDPOINTS
# ========================

async def generate_invoice_number(inv_type: InvoiceType):
    """Generate unique invoice number"""
    prefix = "PI" if inv_type == InvoiceType.PURCHASE else "SI"
    count = await db.invoices.count_documents({"type": inv_type.value})
    return f"{prefix}-{datetime.now().strftime('%Y%m')}-{count + 1:04d}"

@api_router.get("/invoices")
async def get_invoices(
    type: Optional[InvoiceType] = None,
    status: Optional[InvoiceStatus] = None,
    user: User = Depends(get_current_user)
):
    """Get all invoices"""
    query = {}
    if type:
        query["type"] = type.value
    if status:
        query["status"] = status.value
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return invoices

@api_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: User = Depends(get_current_user)):
    """Get a single invoice"""
    invoice = await db.invoices.find_one({"invoice_id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice

@api_router.post("/invoices")
async def create_invoice(invoice_data: InvoiceCreate, user: User = Depends(get_current_user)):
    """Create an invoice"""
    # Get party name
    party_name = "Unknown"
    if invoice_data.type == InvoiceType.PURCHASE:
        supplier = await db.suppliers.find_one({"supplier_id": invoice_data.party_id}, {"_id": 0})
        party_name = supplier["name"] if supplier else "Unknown"
    else:
        distributor = await db.distributors.find_one({"distributor_id": invoice_data.party_id}, {"_id": 0})
        party_name = distributor["name"] if distributor else "Unknown"
    
    invoice = Invoice(
        invoice_number=await generate_invoice_number(invoice_data.type),
        type=invoice_data.type,
        reference_id=invoice_data.reference_id,
        party_id=invoice_data.party_id,
        party_name=party_name,
        due_date=invoice_data.due_date,
        subtotal=invoice_data.subtotal,
        tax_amount=invoice_data.tax_amount,
        total=invoice_data.subtotal + invoice_data.tax_amount
    )
    
    await db.invoices.insert_one(invoice.model_dump())
    return invoice.model_dump()

# ========================
# PAYMENT ENDPOINTS
# ========================

@api_router.get("/payments")
async def get_payments(invoice_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all payments"""
    query = {}
    if invoice_id:
        query["invoice_id"] = invoice_id
    
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return payments

@api_router.post("/payments")
async def create_payment(payment_data: PaymentCreate, user: User = Depends(get_current_user)):
    """Record a payment"""
    invoice = await db.invoices.find_one({"invoice_id": payment_data.invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    payment = Payment(
        **payment_data.model_dump(),
        created_by=user.user_id
    )
    await db.payments.insert_one(payment.model_dump())
    
    # Update invoice paid amount
    new_paid = invoice.get("paid_amount", 0) + payment_data.amount
    new_status = InvoiceStatus.PAID if new_paid >= invoice["total"] else InvoiceStatus.PARTIAL
    
    await db.invoices.update_one(
        {"invoice_id": payment_data.invoice_id},
        {"$set": {"paid_amount": new_paid, "status": new_status.value}}
    )
    
    return payment.model_dump()

# ========================
# CHART OF ACCOUNTS ENDPOINTS
# ========================

@api_router.get("/accounts")
async def get_accounts(type: Optional[AccountType] = None, user: User = Depends(get_current_user)):
    """Get chart of accounts"""
    query = {"is_active": True}
    if type:
        query["type"] = type.value
    
    accounts = await db.chart_of_accounts.find(query, {"_id": 0}).to_list(1000)
    return accounts

@api_router.post("/accounts")
async def create_account(account_data: ChartOfAccountCreate, user: User = Depends(get_current_user)):
    """Create an account"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    existing = await db.chart_of_accounts.find_one({"code": account_data.code}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Account code already exists")
    
    account = ChartOfAccount(**account_data.model_dump())
    await db.chart_of_accounts.insert_one(account.model_dump())
    return account.model_dump()

# ========================
# DASHBOARD ENDPOINTS
# ========================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: User = Depends(get_current_user)):
    """Get dashboard statistics"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Count totals
    total_products = await db.products.count_documents({"is_active": True})
    total_suppliers = await db.suppliers.count_documents({"is_active": True})
    total_distributors = await db.distributors.count_documents({"is_active": True})
    total_warehouses = await db.warehouses.count_documents({"is_active": True})
    
    # Calculate inventory value
    inventory = await db.inventory_stock.find({}, {"_id": 0}).to_list(10000)
    total_inventory_value = 0.0
    for stock in inventory:
        product = await db.products.find_one({"product_id": stock["product_id"]}, {"_id": 0})
        if product:
            total_inventory_value += stock.get("quantity", 0) * product.get("cost_price", 0)
    
    # Count low stock items
    low_stock_items = await get_low_stock_items(user)
    low_stock_count = len(low_stock_items)
    
    # Today's sales
    today_sales_orders = await db.sales_orders.find({
        "order_date": {"$gte": today}
    }, {"_id": 0}).to_list(1000)
    today_sales = sum(so.get("total_amount", 0) for so in today_sales_orders)
    
    # Today's purchases
    today_purchase_orders = await db.purchase_orders.find({
        "order_date": {"$gte": today}
    }, {"_id": 0}).to_list(1000)
    today_purchases = sum(po.get("total_amount", 0) for po in today_purchase_orders)
    
    # Pending invoices
    pending_invoices = await db.invoices.count_documents({
        "status": {"$in": [InvoiceStatus.UNPAID.value, InvoiceStatus.PARTIAL.value]}
    })
    
    # Cash balance (simplified - sum of all payments minus purchase payments)
    all_payments = await db.payments.find({}, {"_id": 0}).to_list(10000)
    cash_balance = 0.0
    for payment in all_payments:
        invoice = await db.invoices.find_one({"invoice_id": payment["invoice_id"]}, {"_id": 0})
        if invoice:
            if invoice["type"] == InvoiceType.SALE.value:
                cash_balance += payment["amount"]
            else:
                cash_balance -= payment["amount"]
    
    return DashboardStats(
        total_inventory_value=round(total_inventory_value, 2),
        low_stock_count=low_stock_count,
        today_sales=round(today_sales, 2),
        today_purchases=round(today_purchases, 2),
        cash_balance=round(cash_balance, 2),
        pending_invoices=pending_invoices,
        total_products=total_products,
        total_suppliers=total_suppliers,
        total_distributors=total_distributors,
        total_warehouses=total_warehouses
    )

@api_router.get("/dashboard/recent-activity")
async def get_recent_activity(limit: int = 10, user: User = Depends(get_current_user)):
    """Get recent activity feed"""
    activities = []
    
    # Recent purchase orders
    recent_pos = await db.purchase_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for po in recent_pos:
        activities.append({
            "type": "purchase_order",
            "title": f"PO {po['po_number']}",
            "description": f"Created for {po.get('supplier_name', 'Unknown')}",
            "amount": po.get("total_amount", 0),
            "status": po.get("status"),
            "timestamp": po.get("created_at")
        })
    
    # Recent sales orders
    recent_sos = await db.sales_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for so in recent_sos:
        activities.append({
            "type": "sales_order",
            "title": f"SO {so['so_number']}",
            "description": f"Created for {so.get('distributor_name', 'Unknown')}",
            "amount": so.get("total_amount", 0),
            "status": so.get("status"),
            "timestamp": so.get("created_at")
        })
    
    # Recent stock transactions
    recent_txns = await db.stock_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for txn in recent_txns:
        product = await db.products.find_one({"product_id": txn["product_id"]}, {"_id": 0})
        activities.append({
            "type": "stock_transaction",
            "title": f"Stock {txn['type']}",
            "description": f"{product['name'] if product else 'Unknown'}: {txn['quantity']} units",
            "amount": None,
            "status": txn.get("type"),
            "timestamp": txn.get("created_at")
        })
    
    # Sort by timestamp and return top N
    activities.sort(key=lambda x: x.get("timestamp") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return activities[:limit]

@api_router.get("/dashboard/sales-chart")
async def get_sales_chart(days: int = 7, user: User = Depends(get_current_user)):
    """Get sales vs purchases chart data"""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    chart_data = []
    for i in range(days):
        date = start_date + timedelta(days=i)
        next_date = date + timedelta(days=1)
        
        # Sales for the day
        day_sales = await db.sales_orders.find({
            "order_date": {"$gte": date, "$lt": next_date}
        }, {"_id": 0}).to_list(1000)
        total_sales = sum(so.get("total_amount", 0) for so in day_sales)
        
        # Purchases for the day
        day_purchases = await db.purchase_orders.find({
            "order_date": {"$gte": date, "$lt": next_date}
        }, {"_id": 0}).to_list(1000)
        total_purchases = sum(po.get("total_amount", 0) for po in day_purchases)
        
        chart_data.append({
            "date": date.strftime("%Y-%m-%d"),
            "sales": round(total_sales, 2),
            "purchases": round(total_purchases, 2)
        })
    
    return chart_data

@api_router.get("/dashboard/top-products")
async def get_top_products(limit: int = 5, user: User = Depends(get_current_user)):
    """Get top selling products"""
    # Aggregate sales by product
    product_sales = {}
    
    sales_orders = await db.sales_orders.find({}, {"_id": 0}).to_list(1000)
    for so in sales_orders:
        for item in so.get("items", []):
            pid = item["product_id"]
            if pid not in product_sales:
                product_sales[pid] = {"quantity": 0, "revenue": 0}
            product_sales[pid]["quantity"] += item.get("quantity", 0)
            product_sales[pid]["revenue"] += item.get("quantity", 0) * item.get("unit_price", 0)
    
    # Sort and get top products
    sorted_products = sorted(product_sales.items(), key=lambda x: x[1]["revenue"], reverse=True)[:limit]
    
    result = []
    for pid, data in sorted_products:
        product = await db.products.find_one({"product_id": pid}, {"_id": 0})
        if product:
            result.append({
                "product_id": pid,
                "name": product["name"],
                "sku": product["sku"],
                "quantity_sold": data["quantity"],
                "revenue": round(data["revenue"], 2)
            })
    
    return result

# ========================
# NOTIFICATIONS ENDPOINTS
# ========================

@api_router.get("/notifications")
async def get_notifications(unread_only: bool = False, user: User = Depends(get_current_user)):
    """Get user notifications"""
    query = {"user_id": user.user_id}
    if unread_only:
        query["is_read"] = False
    
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: User = Depends(get_current_user)):
    """Mark notification as read"""
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"is_read": True}}
    )
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": user.user_id},
        {"$set": {"is_read": True}}
    )
    return {"message": "All notifications marked as read"}

# ========================
# REPORTS ENDPOINTS
# ========================

@api_router.get("/reports/stock-summary")
async def get_stock_summary_report(warehouse_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get stock summary report"""
    query = {}
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    
    stocks = await db.inventory_stock.find(query, {"_id": 0}).to_list(10000)
    
    report = []
    for stock in stocks:
        product = await db.products.find_one({"product_id": stock["product_id"]}, {"_id": 0})
        warehouse = await db.warehouses.find_one({"warehouse_id": stock["warehouse_id"]}, {"_id": 0})
        
        if product:
            report.append({
                "product_id": stock["product_id"],
                "product_name": product["name"],
                "sku": product["sku"],
                "category": product.get("category"),
                "warehouse_id": stock["warehouse_id"],
                "warehouse_name": warehouse["name"] if warehouse else "Unknown",
                "quantity": stock.get("quantity", 0),
                "unit": product.get("unit", "pcs"),
                "cost_price": product.get("cost_price", 0),
                "value": round(stock.get("quantity", 0) * product.get("cost_price", 0), 2),
                "reorder_level": product.get("reorder_level", 0),
                "is_low_stock": stock.get("quantity", 0) <= product.get("reorder_level", 0)
            })
    
    return report

@api_router.get("/reports/purchase-analysis")
async def get_purchase_analysis_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get purchase analysis report"""
    query = {}
    if start_date:
        query["order_date"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "order_date" in query:
            query["order_date"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["order_date"] = {"$lte": datetime.fromisoformat(end_date)}
    
    orders = await db.purchase_orders.find(query, {"_id": 0}).to_list(10000)
    
    # Aggregate by supplier
    by_supplier = {}
    for order in orders:
        sid = order["supplier_id"]
        if sid not in by_supplier:
            by_supplier[sid] = {
                "supplier_name": order.get("supplier_name", "Unknown"),
                "order_count": 0,
                "total_amount": 0
            }
        by_supplier[sid]["order_count"] += 1
        by_supplier[sid]["total_amount"] += order.get("total_amount", 0)
    
    return {
        "total_orders": len(orders),
        "total_amount": round(sum(o.get("total_amount", 0) for o in orders), 2),
        "by_supplier": list(by_supplier.values())
    }

@api_router.get("/reports/sales-analysis")
async def get_sales_analysis_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get sales analysis report"""
    query = {}
    if start_date:
        query["order_date"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "order_date" in query:
            query["order_date"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["order_date"] = {"$lte": datetime.fromisoformat(end_date)}
    
    orders = await db.sales_orders.find(query, {"_id": 0}).to_list(10000)
    
    # Aggregate by distributor
    by_distributor = {}
    for order in orders:
        did = order["distributor_id"]
        if did not in by_distributor:
            by_distributor[did] = {
                "distributor_name": order.get("distributor_name", "Unknown"),
                "order_count": 0,
                "total_amount": 0
            }
        by_distributor[did]["order_count"] += 1
        by_distributor[did]["total_amount"] += order.get("total_amount", 0)
    
    return {
        "total_orders": len(orders),
        "total_amount": round(sum(o.get("total_amount", 0) for o in orders), 2),
        "by_distributor": list(by_distributor.values())
    }

# ========================
# AUDIT LOG ENDPOINTS
# ========================

async def create_audit_log(user_id: str, action: str, entity_type: str, entity_id: str, old_value: dict = None, new_value: dict = None):
    """Helper function to create audit logs"""
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_value,
        new_value=new_value
    )
    await db.audit_logs.insert_one(log.model_dump())

@api_router.get("/audit-logs")
async def get_audit_logs(
    entity_type: Optional[str] = None,
    limit: int = 100,
    user: User = Depends(get_current_user)
):
    """Get audit logs (admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    
    # Enrich with user names
    for log in logs:
        user_doc = await db.users.find_one({"user_id": log.get("user_id")}, {"_id": 0, "name": 1})
        log["user_name"] = user_doc.get("name") if user_doc else "Unknown"
    
    return logs

# ========================
# EXPENSE TRACKING ENDPOINTS
# ========================

class ExpenseCategory(str, Enum):
    OFFICE = "office"
    TRAVEL = "travel"
    UTILITIES = "utilities"
    SALARY = "salary"
    MARKETING = "marketing"
    MAINTENANCE = "maintenance"
    SUPPLIES = "supplies"
    OTHER = "other"

class Expense(BaseModel):
    expense_id: str = Field(default_factory=lambda: f"exp_{uuid.uuid4().hex[:12]}")
    category: ExpenseCategory
    amount: float
    description: str
    vendor: Optional[str] = None
    receipt_image: Optional[str] = None  # Base64 encoded
    expense_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payment_method: PaymentMethod = PaymentMethod.CASH
    approved: bool = False
    approved_by: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseCreate(BaseModel):
    category: ExpenseCategory
    amount: float
    description: str
    vendor: Optional[str] = None
    receipt_image: Optional[str] = None
    expense_date: Optional[datetime] = None
    payment_method: PaymentMethod = PaymentMethod.CASH

@api_router.get("/expenses")
async def get_expenses(
    category: Optional[ExpenseCategory] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    approved_only: bool = False,
    user: User = Depends(get_current_user)
):
    """Get all expenses"""
    query = {}
    if category:
        query["category"] = category.value
    if approved_only:
        query["approved"] = True
    if start_date:
        query["expense_date"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "expense_date" in query:
            query["expense_date"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["expense_date"] = {"$lte": datetime.fromisoformat(end_date)}
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("expense_date", -1).to_list(1000)
    return expenses

@api_router.post("/expenses")
async def create_expense(expense_data: ExpenseCreate, user: User = Depends(get_current_user)):
    """Create an expense"""
    expense_dict = expense_data.model_dump(exclude={'expense_date'})
    expense = Expense(
        **expense_dict,
        expense_date=expense_data.expense_date or datetime.now(timezone.utc),
        created_by=user.user_id
    )
    await db.expenses.insert_one(expense.model_dump())
    await create_audit_log(user.user_id, "create", "expense", expense.expense_id)
    return expense.model_dump()

@api_router.put("/expenses/{expense_id}/approve")
async def approve_expense(expense_id: str, user: User = Depends(get_current_user)):
    """Approve an expense (manager only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.expenses.update_one(
        {"expense_id": expense_id},
        {"$set": {"approved": True, "approved_by": user.user_id}}
    )
    await create_audit_log(user.user_id, "approve", "expense", expense_id)
    return {"message": "Expense approved"}

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: User = Depends(get_current_user)):
    """Delete an expense"""
    await db.expenses.delete_one({"expense_id": expense_id})
    await create_audit_log(user.user_id, "delete", "expense", expense_id)
    return {"message": "Expense deleted"}

# ========================
# QUOTATION ENDPOINTS
# ========================

class QuotationStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"

class QuotationItem(BaseModel):
    item_id: str = Field(default_factory=lambda: f"qi_{uuid.uuid4().hex[:12]}")
    product_id: str
    product_name: Optional[str] = None
    quantity: float
    unit_price: float
    discount_percent: float = 0.0

class Quotation(BaseModel):
    quotation_id: str = Field(default_factory=lambda: f"qt_{uuid.uuid4().hex[:12]}")
    quotation_number: str
    distributor_id: str
    distributor_name: Optional[str] = None
    items: List[QuotationItem] = []
    subtotal: float = 0.0
    discount_amount: float = 0.0
    tax_amount: float = 0.0
    total_amount: float = 0.0
    valid_until: datetime
    status: QuotationStatus = QuotationStatus.DRAFT
    notes: Optional[str] = None
    terms: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QuotationItemCreate(BaseModel):
    product_id: str
    quantity: float
    unit_price: float
    discount_percent: float = 0.0

class QuotationCreate(BaseModel):
    distributor_id: str
    items: List[QuotationItemCreate] = []
    tax_amount: float = 0.0
    valid_days: int = 30
    notes: Optional[str] = None
    terms: Optional[str] = None

async def generate_quotation_number():
    count = await db.quotations.count_documents({})
    return f"QT-{datetime.now().strftime('%Y%m')}-{count + 1:04d}"

@api_router.get("/quotations")
async def get_quotations(
    status: Optional[QuotationStatus] = None,
    distributor_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all quotations"""
    query = {}
    if status:
        query["status"] = status.value
    if distributor_id:
        query["distributor_id"] = distributor_id
    
    quotations = await db.quotations.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return quotations

@api_router.post("/quotations")
async def create_quotation(qt_data: QuotationCreate, user: User = Depends(get_current_user)):
    """Create a quotation"""
    distributor = await db.distributors.find_one({"distributor_id": qt_data.distributor_id}, {"_id": 0})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    items = []
    subtotal = 0.0
    discount_total = 0.0
    for item in qt_data.items:
        product = await db.products.find_one({"product_id": item.product_id}, {"_id": 0})
        line_total = item.quantity * item.unit_price
        line_discount = line_total * (item.discount_percent / 100)
        qt_item = QuotationItem(
            product_id=item.product_id,
            product_name=product["name"] if product else "Unknown",
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount_percent=item.discount_percent
        )
        items.append(qt_item.model_dump())
        subtotal += line_total
        discount_total += line_discount
    
    quotation = Quotation(
        quotation_number=await generate_quotation_number(),
        distributor_id=qt_data.distributor_id,
        distributor_name=distributor["name"],
        items=items,
        subtotal=subtotal,
        discount_amount=discount_total,
        tax_amount=qt_data.tax_amount,
        total_amount=subtotal - discount_total + qt_data.tax_amount,
        valid_until=datetime.now(timezone.utc) + timedelta(days=qt_data.valid_days),
        notes=qt_data.notes,
        terms=qt_data.terms,
        created_by=user.user_id
    )
    
    await db.quotations.insert_one(quotation.model_dump())
    await create_audit_log(user.user_id, "create", "quotation", quotation.quotation_id)
    return quotation.model_dump()

@api_router.put("/quotations/{quotation_id}/status")
async def update_quotation_status(quotation_id: str, status: QuotationStatus, user: User = Depends(get_current_user)):
    """Update quotation status"""
    await db.quotations.update_one(
        {"quotation_id": quotation_id},
        {"$set": {"status": status.value}}
    )
    await create_audit_log(user.user_id, "update_status", "quotation", quotation_id, new_value={"status": status.value})
    return await db.quotations.find_one({"quotation_id": quotation_id}, {"_id": 0})

@api_router.post("/quotations/{quotation_id}/convert-to-order")
async def convert_quotation_to_order(
    quotation_id: str,
    warehouse_id: str = None,
    user: User = Depends(get_current_user)
):
    """Convert accepted quotation to sales order"""
    if not warehouse_id:
        raise HTTPException(status_code=400, detail="warehouse_id is required")
    
    quotation = await db.quotations.find_one({"quotation_id": quotation_id}, {"_id": 0})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    if quotation["status"] != QuotationStatus.ACCEPTED.value:
        raise HTTPException(status_code=400, detail="Only accepted quotations can be converted")
    
    # Create sales order from quotation
    so_items = []
    for item in quotation["items"]:
        so_items.append({
            "product_id": item["product_id"],
            "quantity": item["quantity"],
            "unit_price": item["unit_price"] * (1 - item.get("discount_percent", 0) / 100)
        })
    
    so_data = SalesOrderCreate(
        distributor_id=quotation["distributor_id"],
        warehouse_id=warehouse_id,
        items=[SalesOrderItemCreate(**item) for item in so_items],
        tax_amount=quotation["tax_amount"],
        notes=f"Created from {quotation['quotation_number']}"
    )
    
    # Reuse existing create function logic
    distributor = await db.distributors.find_one({"distributor_id": so_data.distributor_id}, {"_id": 0})
    items = []
    subtotal = 0.0
    for item in so_data.items:
        product = await db.products.find_one({"product_id": item.product_id}, {"_id": 0})
        so_item = SalesOrderItem(
            product_id=item.product_id,
            product_name=product["name"] if product else "Unknown",
            quantity=item.quantity,
            unit_price=item.unit_price
        )
        items.append(so_item.model_dump())
        subtotal += item.quantity * item.unit_price
    
    so = SalesOrder(
        so_number=await generate_so_number(),
        distributor_id=so_data.distributor_id,
        distributor_name=distributor["name"] if distributor else "Unknown",
        warehouse_id=warehouse_id,
        items=items,
        subtotal=subtotal,
        tax_amount=so_data.tax_amount,
        total_amount=subtotal + so_data.tax_amount,
        notes=so_data.notes,
        created_by=user.user_id
    )
    
    await db.sales_orders.insert_one(so.model_dump())
    await create_audit_log(user.user_id, "convert", "quotation", quotation_id, new_value={"so_id": so.so_id})
    
    return {"message": "Quotation converted to sales order", "so_id": so.so_id, "so_number": so.so_number}

# ========================
# DELIVERY NOTE ENDPOINTS
# ========================

class DeliveryStatus(str, Enum):
    PENDING = "pending"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    RETURNED = "returned"

class DeliveryNote(BaseModel):
    delivery_id: str = Field(default_factory=lambda: f"dn_{uuid.uuid4().hex[:12]}")
    delivery_number: str
    so_id: str
    so_number: Optional[str] = None
    distributor_id: str
    distributor_name: Optional[str] = None
    warehouse_id: str
    items: List[dict] = []
    status: DeliveryStatus = DeliveryStatus.PENDING
    delivery_date: Optional[datetime] = None
    delivered_by: Optional[str] = None
    received_by: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeliveryNoteCreate(BaseModel):
    so_id: str
    notes: Optional[str] = None

async def generate_delivery_number():
    count = await db.delivery_notes.count_documents({})
    return f"DN-{datetime.now().strftime('%Y%m')}-{count + 1:04d}"

@api_router.get("/delivery-notes")
async def get_delivery_notes(
    status: Optional[DeliveryStatus] = None,
    so_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all delivery notes"""
    query = {}
    if status:
        query["status"] = status.value
    if so_id:
        query["so_id"] = so_id
    
    notes = await db.delivery_notes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return notes

@api_router.post("/delivery-notes")
async def create_delivery_note(dn_data: DeliveryNoteCreate, user: User = Depends(get_current_user)):
    """Create a delivery note from sales order"""
    so = await db.sales_orders.find_one({"so_id": dn_data.so_id}, {"_id": 0})
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    
    delivery = DeliveryNote(
        delivery_number=await generate_delivery_number(),
        so_id=so["so_id"],
        so_number=so["so_number"],
        distributor_id=so["distributor_id"],
        distributor_name=so.get("distributor_name"),
        warehouse_id=so["warehouse_id"],
        items=so.get("items", []),
        notes=dn_data.notes,
        created_by=user.user_id
    )
    
    await db.delivery_notes.insert_one(delivery.model_dump())
    await create_audit_log(user.user_id, "create", "delivery_note", delivery.delivery_id)
    return delivery.model_dump()

@api_router.put("/delivery-notes/{delivery_id}/status")
async def update_delivery_status(
    delivery_id: str,
    status: DeliveryStatus,
    received_by: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Update delivery note status"""
    update_data = {"status": status.value}
    if status == DeliveryStatus.DELIVERED:
        update_data["delivery_date"] = datetime.now(timezone.utc)
        update_data["delivered_by"] = user.user_id
        if received_by:
            update_data["received_by"] = received_by
        
        # Update sales order status
        delivery = await db.delivery_notes.find_one({"delivery_id": delivery_id}, {"_id": 0})
        if delivery:
            await db.sales_orders.update_one(
                {"so_id": delivery["so_id"]},
                {"$set": {"status": OrderStatus.DELIVERED.value, "updated_at": datetime.now(timezone.utc)}}
            )
    
    await db.delivery_notes.update_one({"delivery_id": delivery_id}, {"$set": update_data})
    await create_audit_log(user.user_id, "update_status", "delivery_note", delivery_id, new_value={"status": status.value})
    return await db.delivery_notes.find_one({"delivery_id": delivery_id}, {"_id": 0})

# ========================
# BILL OF MATERIALS (BOM) ENDPOINTS
# ========================

class BOMItem(BaseModel):
    raw_product_id: str
    raw_product_name: Optional[str] = None
    quantity_required: float
    unit: Optional[str] = None

class BillOfMaterials(BaseModel):
    bom_id: str = Field(default_factory=lambda: f"bom_{uuid.uuid4().hex[:12]}")
    finished_product_id: str
    finished_product_name: Optional[str] = None
    components: List[BOMItem] = []
    yield_quantity: float = 1.0
    notes: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BOMItemCreate(BaseModel):
    raw_product_id: str
    quantity_required: float

class BOMCreate(BaseModel):
    finished_product_id: str
    components: List[BOMItemCreate] = []
    yield_quantity: float = 1.0
    notes: Optional[str] = None

@api_router.get("/bom")
async def get_all_bom(user: User = Depends(get_current_user)):
    """Get all BOMs"""
    boms = await db.bill_of_materials.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return boms

@api_router.get("/bom/{product_id}")
async def get_bom_for_product(product_id: str, user: User = Depends(get_current_user)):
    """Get BOM for a finished product"""
    bom = await db.bill_of_materials.find_one({"finished_product_id": product_id, "is_active": True}, {"_id": 0})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    return bom

@api_router.post("/bom")
async def create_bom(bom_data: BOMCreate, user: User = Depends(get_current_user)):
    """Create a BOM for a finished product"""
    # Verify finished product exists and is finished category
    finished = await db.products.find_one({"product_id": bom_data.finished_product_id}, {"_id": 0})
    if not finished:
        raise HTTPException(status_code=404, detail="Finished product not found")
    if finished["category"] != "finished":
        raise HTTPException(status_code=400, detail="BOM can only be created for finished products")
    
    # Build components with names
    components = []
    for comp in bom_data.components:
        raw = await db.products.find_one({"product_id": comp.raw_product_id}, {"_id": 0})
        if not raw:
            raise HTTPException(status_code=404, detail=f"Raw material {comp.raw_product_id} not found")
        components.append(BOMItem(
            raw_product_id=comp.raw_product_id,
            raw_product_name=raw["name"],
            quantity_required=comp.quantity_required,
            unit=raw.get("unit")
        ).model_dump())
    
    bom = BillOfMaterials(
        finished_product_id=bom_data.finished_product_id,
        finished_product_name=finished["name"],
        components=components,
        yield_quantity=bom_data.yield_quantity,
        notes=bom_data.notes
    )
    
    # Deactivate existing BOM for this product
    await db.bill_of_materials.update_many(
        {"finished_product_id": bom_data.finished_product_id},
        {"$set": {"is_active": False}}
    )
    
    await db.bill_of_materials.insert_one(bom.model_dump())
    await create_audit_log(user.user_id, "create", "bom", bom.bom_id)
    return bom.model_dump()

@api_router.post("/bom/{bom_id}/produce")
async def produce_from_bom(
    bom_id: str,
    quantity: float,
    warehouse_id: str,
    user: User = Depends(get_current_user)
):
    """Produce finished goods from raw materials using BOM"""
    bom = await db.bill_of_materials.find_one({"bom_id": bom_id, "is_active": True}, {"_id": 0})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    # Check if all raw materials are available
    multiplier = quantity / bom["yield_quantity"]
    for comp in bom["components"]:
        stock = await db.inventory_stock.find_one({
            "product_id": comp["raw_product_id"],
            "warehouse_id": warehouse_id
        }, {"_id": 0})
        required = comp["quantity_required"] * multiplier
        available = stock.get("quantity", 0) if stock else 0
        if available < required:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient {comp['raw_product_name']}: need {required}, have {available}"
            )
    
    # Deduct raw materials
    for comp in bom["components"]:
        required = comp["quantity_required"] * multiplier
        stock = await db.inventory_stock.find_one({
            "product_id": comp["raw_product_id"],
            "warehouse_id": warehouse_id
        }, {"_id": 0})
        new_qty = stock["quantity"] - required
        await db.inventory_stock.update_one(
            {"stock_id": stock["stock_id"]},
            {"$set": {"quantity": new_qty, "last_updated": datetime.now(timezone.utc)}}
        )
        # Record transaction
        await db.stock_transactions.insert_one(StockTransaction(
            product_id=comp["raw_product_id"],
            warehouse_id=warehouse_id,
            type=TransactionType.PRODUCTION,
            quantity=-required,
            reference_id=bom_id,
            notes=f"Used in production of {bom['finished_product_name']}",
            created_by=user.user_id
        ).model_dump())
    
    # Add finished goods
    finished_stock = await db.inventory_stock.find_one({
        "product_id": bom["finished_product_id"],
        "warehouse_id": warehouse_id
    }, {"_id": 0})
    
    if finished_stock:
        new_qty = finished_stock["quantity"] + quantity
        await db.inventory_stock.update_one(
            {"stock_id": finished_stock["stock_id"]},
            {"$set": {"quantity": new_qty, "last_updated": datetime.now(timezone.utc)}}
        )
    else:
        new_stock = InventoryStock(
            product_id=bom["finished_product_id"],
            warehouse_id=warehouse_id,
            quantity=quantity
        )
        await db.inventory_stock.insert_one(new_stock.model_dump())
    
    # Record finished goods transaction
    await db.stock_transactions.insert_one(StockTransaction(
        product_id=bom["finished_product_id"],
        warehouse_id=warehouse_id,
        type=TransactionType.PRODUCTION,
        quantity=quantity,
        reference_id=bom_id,
        notes=f"Produced from BOM",
        created_by=user.user_id
    ).model_dump())
    
    await create_audit_log(user.user_id, "produce", "bom", bom_id, new_value={"quantity": quantity})
    return {"message": f"Produced {quantity} units of {bom['finished_product_name']}"}

# ========================
# ENHANCED FINANCIAL REPORTS
# ========================

@api_router.get("/reports/profit-loss")
async def get_profit_loss_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get Profit & Loss report"""
    # Default to current month
    if not start_date:
        start_date = datetime.now(timezone.utc).replace(day=1).isoformat()
    if not end_date:
        end_date = datetime.now(timezone.utc).isoformat()
    
    start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00')) if 'Z' in start_date or '+' in start_date else datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00')) if 'Z' in end_date or '+' in end_date else datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc)
    
    # Calculate Revenue (from delivered/paid sales orders)
    sales = await db.sales_orders.find({
        "order_date": {"$gte": start_dt, "$lte": end_dt},
        "status": {"$in": ["delivered", "paid"]}
    }, {"_id": 0}).to_list(10000)
    total_revenue = sum(so.get("total_amount", 0) for so in sales)
    
    # Calculate Cost of Goods Sold (from received/paid purchase orders)
    purchases = await db.purchase_orders.find({
        "order_date": {"$gte": start_dt, "$lte": end_dt},
        "status": {"$in": ["received", "paid"]}
    }, {"_id": 0}).to_list(10000)
    total_cogs = sum(po.get("total_amount", 0) for po in purchases)
    
    # Calculate Expenses
    expenses = await db.expenses.find({
        "expense_date": {"$gte": start_dt, "$lte": end_dt},
        "approved": True
    }, {"_id": 0}).to_list(10000)
    total_expenses = sum(exp.get("amount", 0) for exp in expenses)
    
    # Expense breakdown by category
    expense_by_category = {}
    for exp in expenses:
        cat = exp.get("category", "other")
        expense_by_category[cat] = expense_by_category.get(cat, 0) + exp.get("amount", 0)
    
    gross_profit = total_revenue - total_cogs
    net_profit = gross_profit - total_expenses
    gross_margin = (gross_profit / total_revenue * 100) if total_revenue > 0 else 0
    net_margin = (net_profit / total_revenue * 100) if total_revenue > 0 else 0
    
    return {
        "period": {"start": start_date, "end": end_date},
        "revenue": {
            "total_sales": round(total_revenue, 2),
            "sales_count": len(sales)
        },
        "cost_of_goods_sold": {
            "total_cogs": round(total_cogs, 2),
            "purchase_count": len(purchases)
        },
        "gross_profit": round(gross_profit, 2),
        "gross_margin_percent": round(gross_margin, 2),
        "operating_expenses": {
            "total": round(total_expenses, 2),
            "by_category": {k: round(v, 2) for k, v in expense_by_category.items()}
        },
        "net_profit": round(net_profit, 2),
        "net_margin_percent": round(net_margin, 2)
    }

@api_router.get("/reports/cash-flow")
async def get_cash_flow_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get Cash Flow report"""
    if not start_date:
        start_date = datetime.now(timezone.utc).replace(day=1).isoformat()
    if not end_date:
        end_date = datetime.now(timezone.utc).isoformat()
    
    start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00')) if 'Z' in start_date or '+' in start_date else datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00')) if 'Z' in end_date or '+' in end_date else datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc)
    
    # Cash Inflows (payments received)
    inflow_payments = await db.payments.find({
        "payment_date": {"$gte": start_dt, "$lte": end_dt}
    }, {"_id": 0}).to_list(10000)
    
    cash_inflows = 0.0
    cash_outflows = 0.0
    inflow_details = []
    outflow_details = []
    
    for payment in inflow_payments:
        invoice = await db.invoices.find_one({"invoice_id": payment["invoice_id"]}, {"_id": 0})
        if invoice:
            if invoice["type"] == "sale":
                cash_inflows += payment["amount"]
                inflow_details.append({
                    "date": payment["payment_date"],
                    "amount": payment["amount"],
                    "source": invoice.get("party_name", "Customer"),
                    "method": payment.get("method")
                })
            else:
                cash_outflows += payment["amount"]
                outflow_details.append({
                    "date": payment["payment_date"],
                    "amount": payment["amount"],
                    "destination": invoice.get("party_name", "Supplier"),
                    "method": payment.get("method"),
                    "type": "supplier_payment"
                })
    
    # Add expenses to outflows
    expenses = await db.expenses.find({
        "expense_date": {"$gte": start_dt, "$lte": end_dt},
        "approved": True
    }, {"_id": 0}).to_list(10000)
    
    for exp in expenses:
        cash_outflows += exp["amount"]
        outflow_details.append({
            "date": exp["expense_date"],
            "amount": exp["amount"],
            "destination": exp.get("vendor", exp["category"]),
            "method": exp.get("payment_method"),
            "type": "expense"
        })
    
    net_cash_flow = cash_inflows - cash_outflows
    
    return {
        "period": {"start": start_date, "end": end_date},
        "cash_inflows": {
            "total": round(cash_inflows, 2),
            "count": len(inflow_details),
            "details": inflow_details[-10:]  # Last 10
        },
        "cash_outflows": {
            "total": round(cash_outflows, 2),
            "count": len(outflow_details),
            "details": outflow_details[-10:]
        },
        "net_cash_flow": round(net_cash_flow, 2)
    }

@api_router.get("/reports/supplier-aging")
async def get_supplier_aging_report(user: User = Depends(get_current_user)):
    """Get Supplier Aging (Accounts Payable) report"""
    today = datetime.now(timezone.utc)
    
    # Get unpaid purchase invoices
    invoices = await db.invoices.find({
        "type": "purchase",
        "status": {"$in": ["unpaid", "partial"]}
    }, {"_id": 0}).to_list(10000)
    
    aging_buckets = {
        "current": {"total": 0, "invoices": []},
        "1_30_days": {"total": 0, "invoices": []},
        "31_60_days": {"total": 0, "invoices": []},
        "61_90_days": {"total": 0, "invoices": []},
        "over_90_days": {"total": 0, "invoices": []}
    }
    
    by_supplier = {}
    
    for inv in invoices:
        due_date = inv.get("due_date")
        if isinstance(due_date, str):
            due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        
        days_overdue = (today - due_date).days if due_date else 0
        outstanding = inv["total"] - inv.get("paid_amount", 0)
        
        inv_summary = {
            "invoice_number": inv["invoice_number"],
            "party_name": inv.get("party_name"),
            "amount": outstanding,
            "due_date": inv.get("due_date"),
            "days_overdue": max(0, days_overdue)
        }
        
        if days_overdue <= 0:
            bucket = "current"
        elif days_overdue <= 30:
            bucket = "1_30_days"
        elif days_overdue <= 60:
            bucket = "31_60_days"
        elif days_overdue <= 90:
            bucket = "61_90_days"
        else:
            bucket = "over_90_days"
        
        aging_buckets[bucket]["total"] += outstanding
        aging_buckets[bucket]["invoices"].append(inv_summary)
        
        supplier_id = inv.get("party_id")
        if supplier_id not in by_supplier:
            by_supplier[supplier_id] = {
                "name": inv.get("party_name"),
                "total": 0,
                "current": 0,
                "overdue": 0
            }
        by_supplier[supplier_id]["total"] += outstanding
        if days_overdue > 0:
            by_supplier[supplier_id]["overdue"] += outstanding
        else:
            by_supplier[supplier_id]["current"] += outstanding
    
    total_payable = sum(b["total"] for b in aging_buckets.values())
    
    return {
        "total_accounts_payable": round(total_payable, 2),
        "aging_summary": {k: round(v["total"], 2) for k, v in aging_buckets.items()},
        "aging_details": {k: {"total": round(v["total"], 2), "invoices": v["invoices"][:5]} for k, v in aging_buckets.items()},
        "by_supplier": list(by_supplier.values())
    }

@api_router.get("/reports/customer-aging")
async def get_customer_aging_report(user: User = Depends(get_current_user)):
    """Get Customer Aging (Accounts Receivable) report"""
    today = datetime.now(timezone.utc)
    
    # Get unpaid sales invoices
    invoices = await db.invoices.find({
        "type": "sale",
        "status": {"$in": ["unpaid", "partial"]}
    }, {"_id": 0}).to_list(10000)
    
    aging_buckets = {
        "current": {"total": 0, "invoices": []},
        "1_30_days": {"total": 0, "invoices": []},
        "31_60_days": {"total": 0, "invoices": []},
        "61_90_days": {"total": 0, "invoices": []},
        "over_90_days": {"total": 0, "invoices": []}
    }
    
    by_customer = {}
    
    for inv in invoices:
        due_date = inv.get("due_date")
        if isinstance(due_date, str):
            due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        elif due_date and due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
        
        days_overdue = (today - due_date).days if due_date else 0
        outstanding = inv["total"] - inv.get("paid_amount", 0)
        
        inv_summary = {
            "invoice_number": inv["invoice_number"],
            "party_name": inv.get("party_name"),
            "amount": outstanding,
            "due_date": inv.get("due_date"),
            "days_overdue": max(0, days_overdue)
        }
        
        if days_overdue <= 0:
            bucket = "current"
        elif days_overdue <= 30:
            bucket = "1_30_days"
        elif days_overdue <= 60:
            bucket = "31_60_days"
        elif days_overdue <= 90:
            bucket = "61_90_days"
        else:
            bucket = "over_90_days"
        
        aging_buckets[bucket]["total"] += outstanding
        aging_buckets[bucket]["invoices"].append(inv_summary)
        
        customer_id = inv.get("party_id")
        if customer_id not in by_customer:
            by_customer[customer_id] = {
                "name": inv.get("party_name"),
                "total": 0,
                "current": 0,
                "overdue": 0
            }
        by_customer[customer_id]["total"] += outstanding
        if days_overdue > 0:
            by_customer[customer_id]["overdue"] += outstanding
        else:
            by_customer[customer_id]["current"] += outstanding
    
    total_receivable = sum(b["total"] for b in aging_buckets.values())
    
    return {
        "total_accounts_receivable": round(total_receivable, 2),
        "aging_summary": {k: round(v["total"], 2) for k, v in aging_buckets.items()},
        "aging_details": {k: {"total": round(v["total"], 2), "invoices": v["invoices"][:5]} for k, v in aging_buckets.items()},
        "by_customer": list(by_customer.values())
    }

@api_router.get("/reports/inventory-valuation")
async def get_inventory_valuation_report(
    method: str = "average",  # average, fifo, lifo
    warehouse_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get Inventory Valuation report"""
    query = {}
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    
    stocks = await db.inventory_stock.find(query, {"_id": 0}).to_list(10000)
    
    valuation = []
    total_value = 0.0
    total_items = 0
    
    for stock in stocks:
        product = await db.products.find_one({"product_id": stock["product_id"]}, {"_id": 0})
        if not product:
            continue
        
        warehouse = await db.warehouses.find_one({"warehouse_id": stock["warehouse_id"]}, {"_id": 0})
        
        qty = stock.get("quantity", 0)
        cost = product.get("cost_price", 0)
        value = qty * cost
        
        valuation.append({
            "product_id": stock["product_id"],
            "product_name": product["name"],
            "sku": product["sku"],
            "category": product.get("category"),
            "warehouse_id": stock["warehouse_id"],
            "warehouse_name": warehouse["name"] if warehouse else "Unknown",
            "quantity": qty,
            "unit": product.get("unit"),
            "unit_cost": cost,
            "total_value": round(value, 2),
            "selling_price": product.get("selling_price", 0),
            "potential_revenue": round(qty * product.get("selling_price", 0), 2)
        })
        
        total_value += value
        total_items += qty
    
    # Sort by value descending
    valuation.sort(key=lambda x: x["total_value"], reverse=True)
    
    return {
        "valuation_method": method,
        "total_inventory_value": round(total_value, 2),
        "total_items": total_items,
        "total_skus": len(valuation),
        "items": valuation,
        "top_5_by_value": valuation[:5]
    }

# ========================
# NOTIFICATION SYSTEM
# ========================

class NotificationType(str, Enum):
    LOW_STOCK = "low_stock"
    ORDER_STATUS = "order_status"
    PAYMENT_DUE = "payment_due"
    APPROVAL_REQUIRED = "approval_required"
    SYSTEM = "system"

async def create_notification(user_id: str, title: str, message: str, notif_type: NotificationType):
    """Helper to create notifications"""
    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=notif_type.value
    )
    await db.notifications.insert_one(notif.model_dump())
    return notif

@api_router.get("/notifications/generate-alerts")
async def generate_system_alerts(user: User = Depends(get_current_user)):
    """Generate system alerts for low stock, overdue payments, etc."""
    alerts_generated = []
    
    # Low stock alerts
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(1000)
    for product in products:
        stocks = await db.inventory_stock.find({"product_id": product["product_id"]}, {"_id": 0}).to_list(100)
        total_qty = sum(s.get("quantity", 0) for s in stocks)
        if total_qty <= product.get("reorder_level", 10):
            await create_notification(
                user.user_id,
                f"Low Stock Alert: {product['name']}",
                f"{product['name']} is low on stock. Current: {total_qty}, Reorder Level: {product['reorder_level']}",
                NotificationType.LOW_STOCK
            )
            alerts_generated.append({"type": "low_stock", "product": product["name"]})
    
    # Overdue invoices
    today = datetime.now(timezone.utc)
    overdue_invoices = await db.invoices.find({
        "status": {"$in": ["unpaid", "partial"]},
        "due_date": {"$lt": today}
    }, {"_id": 0}).to_list(100)
    
    for inv in overdue_invoices:
        await create_notification(
            user.user_id,
            f"Payment Overdue: {inv['invoice_number']}",
            f"Invoice {inv['invoice_number']} for {inv.get('party_name')} is overdue. Amount: ${inv['total'] - inv.get('paid_amount', 0):.2f}",
            NotificationType.PAYMENT_DUE
        )
        alerts_generated.append({"type": "payment_due", "invoice": inv["invoice_number"]})
    
    return {"alerts_generated": len(alerts_generated), "alerts": alerts_generated}

# ========================
# PDF EXPORT ENDPOINTS
# ========================

def generate_invoice_pdf(invoice_data: dict, items: list, company_name: str = "BizCore") -> bytes:
    """Generate PDF for an invoice"""
    if not PDF_AVAILABLE:
        raise HTTPException(status_code=500, detail="PDF generation not available")
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=24, alignment=TA_CENTER, spaceAfter=20)
    header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, alignment=TA_LEFT)
    
    elements = []
    
    # Header
    elements.append(Paragraph(company_name, title_style))
    elements.append(Spacer(1, 0.2*inch))
    
    # Invoice info
    inv_type = "SALES INVOICE" if invoice_data.get("type") == "sale" else "PURCHASE INVOICE"
    elements.append(Paragraph(f"<b>{inv_type}</b>", ParagraphStyle('Type', fontSize=16, alignment=TA_CENTER)))
    elements.append(Spacer(1, 0.2*inch))
    
    # Invoice details table
    inv_number = invoice_data.get("invoice_number", "N/A")
    issue_date = invoice_data.get("issue_date", "")
    if isinstance(issue_date, datetime):
        issue_date = issue_date.strftime("%Y-%m-%d")
    due_date = invoice_data.get("due_date", "")
    if isinstance(due_date, datetime):
        due_date = due_date.strftime("%Y-%m-%d")
    
    details_data = [
        ["Invoice Number:", inv_number, "Issue Date:", str(issue_date)[:10]],
        ["Party:", invoice_data.get("party_name", "N/A"), "Due Date:", str(due_date)[:10]],
        ["Status:", invoice_data.get("status", "").upper(), "", ""],
    ]
    
    details_table = Table(details_data, colWidths=[1.5*inch, 2.5*inch, 1.2*inch, 1.5*inch])
    details_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(details_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Items table
    if items:
        items_header = ["#", "Product", "Quantity", "Unit Price", "Total"]
        items_data = [items_header]
        for i, item in enumerate(items, 1):
            qty = item.get("quantity", 0)
            price = item.get("unit_price", 0)
            total = qty * price
            items_data.append([
                str(i),
                item.get("product_name", "N/A"),
                str(qty),
                f"${price:.2f}",
                f"${total:.2f}"
            ])
        
        items_table = Table(items_data, colWidths=[0.5*inch, 3*inch, 1*inch, 1*inch, 1*inch])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366F1')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F3F4F6')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 0.3*inch))
    
    # Totals
    subtotal = invoice_data.get("subtotal", 0)
    tax = invoice_data.get("tax_amount", 0)
    total = invoice_data.get("total", 0)
    paid = invoice_data.get("paid_amount", 0)
    
    totals_data = [
        ["", "", "Subtotal:", f"${subtotal:.2f}"],
        ["", "", "Tax:", f"${tax:.2f}"],
        ["", "", "Total:", f"${total:.2f}"],
        ["", "", "Paid:", f"${paid:.2f}"],
        ["", "", "Balance Due:", f"${(total - paid):.2f}"],
    ]
    
    totals_table = Table(totals_data, colWidths=[2*inch, 2*inch, 1.5*inch, 1*inch])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('LINEABOVE', (2, -1), (-1, -1), 1, colors.black),
        ('FONTNAME', (2, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (2, -1), (-1, -1), 12),
    ]))
    elements.append(totals_table)
    
    # Footer
    elements.append(Spacer(1, 0.5*inch))
    elements.append(Paragraph("Thank you for your business!", ParagraphStyle('Footer', fontSize=10, alignment=TA_CENTER, textColor=colors.gray)))
    elements.append(Paragraph(f"Generated by {company_name} on {datetime.now().strftime('%Y-%m-%d %H:%M')}", 
                             ParagraphStyle('Footer2', fontSize=8, alignment=TA_CENTER, textColor=colors.gray)))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()

@api_router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(invoice_id: str, user: User = Depends(get_current_user)):
    """Generate and return invoice PDF"""
    invoice = await db.invoices.find_one({"invoice_id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get related order items
    items = []
    if invoice.get("type") == "sale":
        so = await db.sales_orders.find_one({"so_id": invoice.get("reference_id")}, {"_id": 0})
        if so:
            items = so.get("items", [])
    else:
        po = await db.purchase_orders.find_one({"po_id": invoice.get("reference_id")}, {"_id": 0})
        if po:
            items = po.get("items", [])
    
    # Get company info
    company = await db.companies.find_one({}, {"_id": 0})
    company_name = company.get("name", "BizCore") if company else "BizCore"
    
    pdf_bytes = generate_invoice_pdf(invoice, items, company_name)
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{invoice['invoice_number']}.pdf"}
    )

@api_router.get("/invoices/{invoice_id}/pdf-base64")
async def get_invoice_pdf_base64(invoice_id: str, user: User = Depends(get_current_user)):
    """Generate and return invoice PDF as base64 (for mobile)"""
    invoice = await db.invoices.find_one({"invoice_id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    items = []
    if invoice.get("type") == "sale":
        so = await db.sales_orders.find_one({"so_id": invoice.get("reference_id")}, {"_id": 0})
        if so:
            items = so.get("items", [])
    else:
        po = await db.purchase_orders.find_one({"po_id": invoice.get("reference_id")}, {"_id": 0})
        if po:
            items = po.get("items", [])
    
    company = await db.companies.find_one({}, {"_id": 0})
    company_name = company.get("name", "BizCore") if company else "BizCore"
    
    pdf_bytes = generate_invoice_pdf(invoice, items, company_name)
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        "pdf_base64": pdf_base64,
        "filename": f"invoice_{invoice['invoice_number']}.pdf"
    }

def generate_report_pdf(title: str, data: dict, report_type: str) -> bytes:
    """Generate PDF for reports"""
    if not PDF_AVAILABLE:
        raise HTTPException(status_code=500, detail="PDF generation not available")
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20, alignment=TA_CENTER, spaceAfter=20)
    
    elements = []
    
    # Header
    elements.append(Paragraph(title, title_style))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", 
                             ParagraphStyle('Date', fontSize=10, alignment=TA_CENTER, textColor=colors.gray)))
    elements.append(Spacer(1, 0.3*inch))
    
    if report_type == "stock_summary":
        # Stock summary table
        items = data.get("items", [])
        if items:
            header = ["SKU", "Product", "Warehouse", "Qty", "Value"]
            table_data = [header]
            for item in items[:50]:  # Limit to 50 items
                table_data.append([
                    item.get("sku", ""),
                    item.get("product_name", "")[:30],
                    item.get("warehouse_name", "")[:15],
                    str(item.get("quantity", 0)),
                    f"${item.get('value', 0):.2f}"
                ])
            
            table = Table(table_data, colWidths=[1*inch, 2.5*inch, 1.2*inch, 0.8*inch, 1*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366F1')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
            ]))
            elements.append(table)
        
        # Summary
        elements.append(Spacer(1, 0.3*inch))
        elements.append(Paragraph(f"<b>Total Inventory Value: ${data.get('total_inventory_value', 0):,.2f}</b>", 
                                 ParagraphStyle('Summary', fontSize=14, alignment=TA_RIGHT)))
    
    elif report_type == "profit_loss":
        pl_data = [
            ["Revenue", f"${data.get('revenue', {}).get('total_sales', 0):,.2f}"],
            ["Cost of Goods Sold", f"-${data.get('cost_of_goods_sold', {}).get('total_cogs', 0):,.2f}"],
            ["Gross Profit", f"${data.get('gross_profit', 0):,.2f}"],
            ["Operating Expenses", f"-${data.get('operating_expenses', {}).get('total', 0):,.2f}"],
            ["Net Profit", f"${data.get('net_profit', 0):,.2f}"],
        ]
        
        table = Table(pl_data, colWidths=[4*inch, 2*inch])
        table.setStyle(TableStyle([
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LINEBELOW', (0, 2), (-1, 2), 1, colors.black),
            ('LINEBELOW', (0, -1), (-1, -1), 2, colors.black),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 14),
        ]))
        elements.append(table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()

@api_router.get("/reports/stock-summary/pdf")
async def get_stock_summary_pdf(warehouse_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Generate stock summary report PDF"""
    # Get the data
    query = {}
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    
    stocks = await db.inventory_stock.find(query, {"_id": 0}).to_list(10000)
    
    items = []
    total_value = 0.0
    for stock in stocks:
        product = await db.products.find_one({"product_id": stock["product_id"]}, {"_id": 0})
        warehouse = await db.warehouses.find_one({"warehouse_id": stock["warehouse_id"]}, {"_id": 0})
        
        if product:
            value = stock.get("quantity", 0) * product.get("cost_price", 0)
            items.append({
                "sku": product["sku"],
                "product_name": product["name"],
                "warehouse_name": warehouse["name"] if warehouse else "Unknown",
                "quantity": stock.get("quantity", 0),
                "value": value
            })
            total_value += value
    
    data = {"items": items, "total_inventory_value": total_value}
    pdf_bytes = generate_report_pdf("Stock Summary Report", data, "stock_summary")
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=stock_summary_report.pdf"}
    )

@api_router.get("/reports/profit-loss/pdf")
async def get_profit_loss_pdf(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Generate P&L report PDF"""
    # Reuse the existing P&L logic
    if not start_date:
        start_date = datetime.now(timezone.utc).replace(day=1).isoformat()
    if not end_date:
        end_date = datetime.now(timezone.utc).isoformat()
    
    start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00')) if 'Z' in start_date or '+' in start_date else datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00')) if 'Z' in end_date or '+' in end_date else datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc)
    
    sales = await db.sales_orders.find({
        "order_date": {"$gte": start_dt, "$lte": end_dt},
        "status": {"$in": ["delivered", "paid"]}
    }, {"_id": 0}).to_list(10000)
    total_revenue = sum(so.get("total_amount", 0) for so in sales)
    
    purchases = await db.purchase_orders.find({
        "order_date": {"$gte": start_dt, "$lte": end_dt},
        "status": {"$in": ["received", "paid"]}
    }, {"_id": 0}).to_list(10000)
    total_cogs = sum(po.get("total_amount", 0) for po in purchases)
    
    expenses = await db.expenses.find({
        "expense_date": {"$gte": start_dt, "$lte": end_dt},
        "approved": True
    }, {"_id": 0}).to_list(10000)
    total_expenses = sum(exp.get("amount", 0) for exp in expenses)
    
    gross_profit = total_revenue - total_cogs
    net_profit = gross_profit - total_expenses
    
    data = {
        "revenue": {"total_sales": total_revenue},
        "cost_of_goods_sold": {"total_cogs": total_cogs},
        "gross_profit": gross_profit,
        "operating_expenses": {"total": total_expenses},
        "net_profit": net_profit
    }
    
    pdf_bytes = generate_report_pdf("Profit & Loss Statement", data, "profit_loss")
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=profit_loss_report.pdf"}
    )

# ========================
# PUSH NOTIFICATION REGISTRATION
# ========================

class PushTokenRegister(BaseModel):
    push_token: str
    device_type: str = "unknown"  # ios, android, web

@api_router.post("/notifications/register-push-token")
async def register_push_token(token_data: PushTokenRegister, user: User = Depends(get_current_user)):
    """Register push notification token for a user"""
    await db.push_tokens.update_one(
        {"user_id": user.user_id},
        {
            "$set": {
                "user_id": user.user_id,
                "push_token": token_data.push_token,
                "device_type": token_data.device_type,
                "updated_at": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )
    return {"message": "Push token registered"}

@api_router.delete("/notifications/unregister-push-token")
async def unregister_push_token(user: User = Depends(get_current_user)):
    """Unregister push notification token"""
    await db.push_tokens.delete_many({"user_id": user.user_id})
    return {"message": "Push token unregistered"}

@api_router.get("/notifications/push-tokens")
async def get_push_tokens(user: User = Depends(get_current_user)):
    """Get all push tokens (admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    tokens = await db.push_tokens.find({}, {"_id": 0}).to_list(1000)
    return tokens

# ========================
# OFFLINE SYNC ENDPOINTS
# ========================

class SyncData(BaseModel):
    entity_type: str  # products, suppliers, distributors, etc.
    last_sync: Optional[str] = None
    local_changes: List[Dict[str, Any]] = []

@api_router.post("/sync/pull")
async def sync_pull(sync_data: SyncData, user: User = Depends(get_current_user)):
    """Pull data changes since last sync for offline mode"""
    last_sync_dt = None
    if sync_data.last_sync:
        try:
            last_sync_dt = datetime.fromisoformat(sync_data.last_sync.replace('Z', '+00:00'))
        except:
            pass
    
    query = {}
    if last_sync_dt:
        query["updated_at"] = {"$gt": last_sync_dt}
    
    collection_map = {
        "products": db.products,
        "suppliers": db.suppliers,
        "distributors": db.distributors,
        "warehouses": db.warehouses,
        "inventory": db.inventory_stock,
        "purchase_orders": db.purchase_orders,
        "sales_orders": db.sales_orders,
    }
    
    if sync_data.entity_type not in collection_map:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {sync_data.entity_type}")
    
    collection = collection_map[sync_data.entity_type]
    
    # For inventory, we use last_updated instead of updated_at
    if sync_data.entity_type == "inventory" and last_sync_dt:
        query = {"last_updated": {"$gt": last_sync_dt}}
    
    data = await collection.find(query, {"_id": 0}).to_list(10000)
    
    return {
        "entity_type": sync_data.entity_type,
        "sync_time": datetime.now(timezone.utc).isoformat(),
        "count": len(data),
        "data": data
    }

@api_router.post("/sync/push")
async def sync_push(sync_data: SyncData, user: User = Depends(get_current_user)):
    """Push local changes to server for offline mode"""
    if not sync_data.local_changes:
        return {"message": "No changes to sync", "synced": 0}
    
    synced = 0
    errors = []
    
    for change in sync_data.local_changes:
        try:
            action = change.get("action", "update")
            entity_id = change.get("entity_id")
            data = change.get("data", {})
            
            if sync_data.entity_type == "stock_adjustments":
                # Handle stock adjustments
                await db.stock_transactions.insert_one({
                    **data,
                    "created_by": user.user_id,
                    "created_at": datetime.now(timezone.utc),
                    "synced_from_offline": True
                })
                
                # Update inventory
                stock = await db.inventory_stock.find_one({
                    "product_id": data.get("product_id"),
                    "warehouse_id": data.get("warehouse_id")
                }, {"_id": 0})
                
                if stock:
                    new_qty = stock["quantity"] + data.get("quantity", 0)
                    await db.inventory_stock.update_one(
                        {"stock_id": stock["stock_id"]},
                        {"$set": {"quantity": new_qty, "last_updated": datetime.now(timezone.utc)}}
                    )
                synced += 1
            
            elif sync_data.entity_type == "sales_orders" and action == "create":
                # Create new sales order from offline
                data["created_by"] = user.user_id
                data["created_at"] = datetime.now(timezone.utc)
                data["synced_from_offline"] = True
                await db.sales_orders.insert_one(data)
                synced += 1
            
            elif sync_data.entity_type == "purchase_orders" and action == "create":
                # Create new purchase order from offline
                data["created_by"] = user.user_id
                data["created_at"] = datetime.now(timezone.utc)
                data["synced_from_offline"] = True
                await db.purchase_orders.insert_one(data)
                synced += 1
        
        except Exception as e:
            errors.append({"entity_id": entity_id, "error": str(e)})
    
    return {
        "message": f"Synced {synced} changes",
        "synced": synced,
        "errors": errors
    }

@api_router.get("/sync/status")
async def get_sync_status(user: User = Depends(get_current_user)):
    """Get sync status for all entities"""
    entities = ["products", "suppliers", "distributors", "warehouses", "purchase_orders", "sales_orders"]
    
    status = {}
    for entity in entities:
        collection = db[entity]
        count = await collection.count_documents({})
        latest = await collection.find_one({}, {"_id": 0, "updated_at": 1}, sort=[("updated_at", -1)])
        status[entity] = {
            "count": count,
            "last_updated": latest.get("updated_at").isoformat() if latest and latest.get("updated_at") else None
        }
    
    return {
        "server_time": datetime.now(timezone.utc).isoformat(),
        "entities": status
    }

# ========================
# BARCODE LOOKUP
# ========================

@api_router.get("/barcode/{barcode}")
async def lookup_barcode(barcode: str, user: User = Depends(get_current_user)):
    """Look up product by barcode"""
    product = await db.products.find_one({"barcode": barcode, "is_active": True}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Get stock levels
    stocks = await db.inventory_stock.find({"product_id": product["product_id"]}, {"_id": 0}).to_list(100)
    total_stock = sum(s.get("quantity", 0) for s in stocks)
    
    return {
        "product": product,
        "total_stock": total_stock,
        "stock_by_warehouse": stocks
    }

@api_router.post("/barcode/generate")
async def generate_barcode(product_id: str, user: User = Depends(get_current_user)):
    """Generate and assign barcode to product"""
    product = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Generate barcode (simple format: BZC + timestamp + random)
    barcode = f"BZC{datetime.now().strftime('%y%m%d')}{uuid.uuid4().hex[:6].upper()}"
    
    await db.products.update_one(
        {"product_id": product_id},
        {"$set": {"barcode": barcode, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"product_id": product_id, "barcode": barcode}

# ========================
# PURCHASE REQUISITIONS API
# ========================

@api_router.get("/requisitions")
async def list_requisitions(
    status: Optional[RequisitionStatus] = None,
    priority: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """List all purchase requisitions"""
    query = {}
    if status:
        query["status"] = status.value
    if priority:
        query["priority"] = priority
    
    requisitions = await db.requisitions.find(query).sort("created_at", -1).to_list(100)
    return requisitions

@api_router.get("/requisitions/{requisition_id}")
async def get_requisition(requisition_id: str, user: User = Depends(get_current_user)):
    """Get requisition by ID"""
    req = await db.requisitions.find_one({"requisition_id": requisition_id})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return req

@api_router.post("/requisitions")
async def create_requisition(data: PurchaseRequisitionCreate, user: User = Depends(get_current_user)):
    """Create a new purchase requisition"""
    # Generate requisition number
    count = await db.requisitions.count_documents({})
    req_number = f"REQ-{datetime.now().strftime('%Y%m')}-{str(count + 1).zfill(4)}"
    
    # Build items with product names
    items = []
    total = 0.0
    for item_data in data.items:
        product = await db.products.find_one({"product_id": item_data.product_id})
        item = RequisitionItem(
            product_id=item_data.product_id,
            product_name=product["name"] if product else None,
            quantity=item_data.quantity,
            estimated_unit_price=item_data.estimated_unit_price,
            reason=item_data.reason
        )
        items.append(item.model_dump())
        total += item_data.quantity * item_data.estimated_unit_price
    
    requisition = PurchaseRequisition(
        requisition_number=req_number,
        requested_by=user.user_id,
        requested_by_name=user.name,
        department=data.department,
        priority=data.priority,
        required_date=data.required_date,
        items=items,
        total_estimated=total,
        notes=data.notes
    )
    
    await db.requisitions.insert_one(requisition.model_dump())
    await create_audit_log(user.user_id, "create", "requisition", requisition.requisition_id, None, requisition.model_dump())
    
    return requisition.model_dump()

@api_router.put("/requisitions/{requisition_id}/submit")
async def submit_requisition(requisition_id: str, user: User = Depends(get_current_user)):
    """Submit requisition for approval"""
    req = await db.requisitions.find_one({"requisition_id": requisition_id})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    if req["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft requisitions can be submitted")
    
    await db.requisitions.update_one(
        {"requisition_id": requisition_id},
        {"$set": {"status": "pending", "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Requisition submitted for approval"}

@api_router.put("/requisitions/{requisition_id}/approve")
async def approve_requisition(requisition_id: str, user: User = Depends(get_current_user)):
    """Approve a purchase requisition"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Only managers can approve requisitions")
    
    req = await db.requisitions.find_one({"requisition_id": requisition_id})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending requisitions can be approved")
    
    await db.requisitions.update_one(
        {"requisition_id": requisition_id},
        {"$set": {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    await create_audit_log(user.user_id, "update_status", "requisition", requisition_id, {"status": "pending"}, {"status": "approved"})
    
    return {"message": "Requisition approved"}

@api_router.put("/requisitions/{requisition_id}/reject")
async def reject_requisition(requisition_id: str, reason: str = "", user: User = Depends(get_current_user)):
    """Reject a purchase requisition"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Only managers can reject requisitions")
    
    req = await db.requisitions.find_one({"requisition_id": requisition_id})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    await db.requisitions.update_one(
        {"requisition_id": requisition_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": reason,
            "approved_by": user.user_id,
            "approved_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Requisition rejected"}

@api_router.post("/requisitions/{requisition_id}/convert-to-po")
async def convert_requisition_to_po(
    requisition_id: str,
    supplier_id: str,
    warehouse_id: str,
    user: User = Depends(get_current_user)
):
    """Convert approved requisition to Purchase Order"""
    req = await db.requisitions.find_one({"requisition_id": requisition_id})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    if req["status"] != "approved":
        raise HTTPException(status_code=400, detail="Only approved requisitions can be converted")
    
    # Get supplier info
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Create PO number
    count = await db.purchase_orders.count_documents({})
    po_number = f"PO-{datetime.now().strftime('%Y%m')}-{str(count + 1).zfill(4)}"
    
    # Convert items
    po_items = []
    subtotal = 0.0
    for item in req["items"]:
        po_item = PurchaseOrderItem(
            product_id=item["product_id"],
            product_name=item.get("product_name"),
            quantity=item["quantity"],
            unit_price=item["estimated_unit_price"]
        )
        po_items.append(po_item.model_dump())
        subtotal += item["quantity"] * item["estimated_unit_price"]
    
    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=supplier_id,
        supplier_name=supplier["name"],
        warehouse_id=warehouse_id,
        expected_date=req.get("required_date"),
        items=po_items,
        subtotal=subtotal,
        total_amount=subtotal,
        notes=f"Converted from {req['requisition_number']}",
        created_by=user.user_id
    )
    
    await db.purchase_orders.insert_one(po.model_dump())
    
    # Update requisition
    await db.requisitions.update_one(
        {"requisition_id": requisition_id},
        {"$set": {"status": "converted", "converted_po_id": po.po_id, "updated_at": datetime.now(timezone.utc)}}
    )
    
    await create_audit_log(user.user_id, "create", "purchase_order", po.po_id, None, {"from_requisition": requisition_id})
    
    return {"message": "Requisition converted to PO", "po_id": po.po_id, "po_number": po_number}

# ========================
# GOODS RECEIPT NOTES (GRN) API
# ========================

@api_router.get("/grn")
async def list_grns(
    status: Optional[GRNStatus] = None,
    po_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """List all Goods Receipt Notes"""
    query = {}
    if status:
        query["status"] = status.value
    if po_id:
        query["po_id"] = po_id
    
    grns = await db.grns.find(query).sort("created_at", -1).to_list(100)
    return grns

@api_router.get("/grn/{grn_id}")
async def get_grn(grn_id: str, user: User = Depends(get_current_user)):
    """Get GRN by ID"""
    grn = await db.grns.find_one({"grn_id": grn_id})
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    return grn

@api_router.post("/grn")
async def create_grn(data: GRNCreate, user: User = Depends(get_current_user)):
    """Create a new Goods Receipt Note"""
    # Get PO
    po = await db.purchase_orders.find_one({"po_id": data.po_id})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
    
    # Get supplier
    supplier = await db.suppliers.find_one({"supplier_id": po["supplier_id"]})
    
    # Generate GRN number
    count = await db.grns.count_documents({})
    grn_number = f"GRN-{datetime.now().strftime('%Y%m')}-{str(count + 1).zfill(4)}"
    
    # Build GRN items
    items = []
    total = 0.0
    for item_data in data.items:
        # Find PO item
        po_item = next((i for i in po["items"] if i["item_id"] == item_data.po_item_id), None)
        if not po_item:
            continue
        
        product = await db.products.find_one({"product_id": item_data.product_id})
        
        grn_item = GRNItem(
            po_item_id=item_data.po_item_id,
            product_id=item_data.product_id,
            product_name=product["name"] if product else None,
            ordered_quantity=po_item["quantity"],
            received_quantity=item_data.received_quantity,
            accepted_quantity=item_data.accepted_quantity,
            rejected_quantity=item_data.rejected_quantity,
            rejection_reason=item_data.rejection_reason,
            unit_price=po_item["unit_price"]
        )
        items.append(grn_item.model_dump())
        total += item_data.accepted_quantity * po_item["unit_price"]
    
    grn = GoodsReceiptNote(
        grn_number=grn_number,
        po_id=data.po_id,
        po_number=po["po_number"],
        supplier_id=po["supplier_id"],
        supplier_name=supplier["name"] if supplier else None,
        warehouse_id=data.warehouse_id,
        items=items,
        total_amount=total,
        received_by=user.user_id,
        notes=data.notes
    )
    
    await db.grns.insert_one(grn.model_dump())
    
    # Update inventory for accepted items
    for item in items:
        if item["accepted_quantity"] > 0:
            await db.inventory_stock.update_one(
                {"product_id": item["product_id"], "warehouse_id": data.warehouse_id},
                {"$inc": {"quantity": item["accepted_quantity"]}},
                upsert=True
            )
    
    await create_audit_log(user.user_id, "create", "grn", grn.grn_id, None, grn.model_dump())
    
    return grn.model_dump()

@api_router.put("/grn/{grn_id}/status")
async def update_grn_status(grn_id: str, status: GRNStatus, user: User = Depends(get_current_user)):
    """Update GRN status"""
    grn = await db.grns.find_one({"grn_id": grn_id})
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    
    await db.grns.update_one(
        {"grn_id": grn_id},
        {"$set": {"status": status.value}}
    )
    
    return {"message": f"GRN status updated to {status.value}"}

# ========================
# 3-WAY MATCHING API
# ========================

@api_router.get("/three-way-match")
async def list_matches(
    status: Optional[MatchingStatus] = None,
    user: User = Depends(get_current_user)
):
    """List all 3-way matches"""
    query = {}
    if status:
        query["status"] = status.value
    
    matches = await db.three_way_matches.find(query).sort("created_at", -1).to_list(100)
    return matches

@api_router.post("/three-way-match")
async def create_three_way_match(
    po_id: str,
    grn_id: str,
    invoice_id: str,
    user: User = Depends(get_current_user)
):
    """Create a 3-way match between PO, GRN, and Invoice"""
    # Get documents
    po = await db.purchase_orders.find_one({"po_id": po_id})
    grn = await db.grns.find_one({"grn_id": grn_id})
    invoice = await db.invoices.find_one({"invoice_id": invoice_id})
    
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get supplier info
    supplier = await db.suppliers.find_one({"supplier_id": po["supplier_id"]})
    
    # Calculate totals
    po_total = po.get("total_amount", 0)
    grn_total = grn.get("total_amount", 0)
    invoice_total = invoice.get("total_amount", 0)
    
    # Find discrepancies
    discrepancies = []
    variance = max(po_total, grn_total, invoice_total) - min(po_total, grn_total, invoice_total)
    variance_percent = (variance / po_total * 100) if po_total > 0 else 0
    
    # Check quantity discrepancies
    for po_item in po.get("items", []):
        grn_item = next((g for g in grn.get("items", []) if g.get("po_item_id") == po_item.get("item_id")), None)
        if grn_item:
            if grn_item.get("accepted_quantity", 0) != po_item.get("quantity", 0):
                discrepancies.append({
                    "type": "quantity",
                    "product_id": po_item.get("product_id"),
                    "po_qty": po_item.get("quantity"),
                    "grn_qty": grn_item.get("accepted_quantity"),
                    "difference": po_item.get("quantity", 0) - grn_item.get("accepted_quantity", 0)
                })
    
    # Determine status
    if variance == 0 and len(discrepancies) == 0:
        status = MatchingStatus.FULL_MATCH
    elif variance_percent <= 5 and len(discrepancies) <= 2:
        status = MatchingStatus.PARTIAL_MATCH
    else:
        status = MatchingStatus.DISCREPANCY
    
    match = ThreeWayMatch(
        po_id=po_id,
        po_number=po["po_number"],
        grn_id=grn_id,
        grn_number=grn["grn_number"],
        invoice_id=invoice_id,
        invoice_number=invoice["invoice_number"],
        supplier_id=po["supplier_id"],
        supplier_name=supplier["name"] if supplier else None,
        status=status,
        po_total=po_total,
        grn_total=grn_total,
        invoice_total=invoice_total,
        variance=variance,
        variance_percent=round(variance_percent, 2),
        discrepancies=discrepancies
    )
    
    await db.three_way_matches.insert_one(match.model_dump())
    await create_audit_log(user.user_id, "create", "three_way_match", match.match_id, None, match.model_dump())
    
    return match.model_dump()

@api_router.put("/three-way-match/{match_id}/approve")
async def approve_three_way_match(match_id: str, notes: str = "", user: User = Depends(get_current_user)):
    """Approve a 3-way match"""
    match = await db.three_way_matches.find_one({"match_id": match_id})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    await db.three_way_matches.update_one(
        {"match_id": match_id},
        {"$set": {
            "status": "full_match",
            "approved_by": user.user_id,
            "approved_at": datetime.now(timezone.utc),
            "notes": notes
        }}
    )
    
    # Update related invoice as ready for payment
    await db.invoices.update_one(
        {"invoice_id": match["invoice_id"]},
        {"$set": {"matching_approved": True}}
    )
    
    return {"message": "Match approved for payment"}

# ========================
# FINANCIAL REPORTS API
# ========================

@api_router.get("/reports/trial-balance")
async def get_trial_balance(
    as_of_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Generate Trial Balance Report"""
    date = datetime.fromisoformat(as_of_date) if as_of_date else datetime.now(timezone.utc)
    
    # Get all accounts
    accounts = await db.chart_of_accounts.find({}).to_list(100)
    
    # Calculate balances from transactions
    trial_balance = []
    total_debit = 0.0
    total_credit = 0.0
    
    # Assets (Debit balances)
    assets = []
    inventory_value = 0.0
    products = await db.products.find({}).to_list(1000)
    for product in products:
        stock = await db.inventory_stock.find({"product_id": product["product_id"]}).to_list(100)
        total_qty = sum(s.get("quantity", 0) for s in stock)
        inventory_value += total_qty * product.get("cost_price", 0)
    
    assets.append({"account": "Inventory", "type": "asset", "debit": inventory_value, "credit": 0})
    total_debit += inventory_value
    
    # Calculate AR from unpaid sales invoices
    ar = await db.invoices.aggregate([
        {"$match": {"type": "sale", "status": {"$in": ["unpaid", "partial"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    ar_total = ar[0]["total"] if ar else 0
    assets.append({"account": "Accounts Receivable", "type": "asset", "debit": ar_total, "credit": 0})
    total_debit += ar_total
    
    # Liabilities (Credit balances)
    liabilities = []
    
    # Calculate AP from unpaid purchase invoices
    ap = await db.invoices.aggregate([
        {"$match": {"type": "purchase", "status": {"$in": ["unpaid", "partial"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    ap_total = ap[0]["total"] if ap else 0
    liabilities.append({"account": "Accounts Payable", "type": "liability", "debit": 0, "credit": ap_total})
    total_credit += ap_total
    
    # Income (Credit balances)
    income = []
    sales = await db.sales_orders.aggregate([
        {"$match": {"status": {"$in": ["delivered", "paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    sales_total = sales[0]["total"] if sales else 0
    income.append({"account": "Sales Revenue", "type": "income", "debit": 0, "credit": sales_total})
    total_credit += sales_total
    
    # Expenses (Debit balances)
    expenses_data = []
    expenses = await db.expenses.aggregate([
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}
    ]).to_list(100)
    for exp in expenses:
        expenses_data.append({"account": f"Expense - {exp['_id']}", "type": "expense", "debit": exp["total"], "credit": 0})
        total_debit += exp["total"]
    
    # COGS
    cogs = await db.purchase_orders.aggregate([
        {"$match": {"status": {"$in": ["received", "paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    cogs_total = cogs[0]["total"] if cogs else 0
    expenses_data.append({"account": "Cost of Goods Sold", "type": "expense", "debit": cogs_total, "credit": 0})
    total_debit += cogs_total
    
    # Equity (balancing)
    equity_total = total_credit - total_debit
    equity = [{"account": "Retained Earnings", "type": "equity", "debit": 0 if equity_total >= 0 else abs(equity_total), "credit": equity_total if equity_total >= 0 else 0}]
    
    if equity_total >= 0:
        total_credit += equity_total
    else:
        total_debit += abs(equity_total)
    
    return {
        "report_date": date.isoformat(),
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "income": income,
        "expenses": expenses_data,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "is_balanced": abs(total_debit - total_credit) < 0.01
    }

@api_router.get("/reports/balance-sheet")
async def get_balance_sheet(
    as_of_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Generate Balance Sheet Report"""
    date = datetime.fromisoformat(as_of_date) if as_of_date else datetime.now(timezone.utc)
    
    # ASSETS
    # Current Assets
    inventory_value = 0.0
    products = await db.products.find({}).to_list(1000)
    for product in products:
        stock = await db.inventory_stock.find({"product_id": product["product_id"]}).to_list(100)
        total_qty = sum(s.get("quantity", 0) for s in stock)
        inventory_value += total_qty * product.get("cost_price", 0)
    
    ar = await db.invoices.aggregate([
        {"$match": {"type": "sale", "status": {"$in": ["unpaid", "partial"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    ar_total = ar[0]["total"] if ar else 0
    
    current_assets = [
        {"name": "Inventory", "amount": round(inventory_value, 2)},
        {"name": "Accounts Receivable", "amount": round(ar_total, 2)},
    ]
    total_current_assets = inventory_value + ar_total
    
    # Fixed Assets (placeholder)
    fixed_assets = [
        {"name": "Equipment", "amount": 0},
        {"name": "Vehicles", "amount": 0},
    ]
    total_fixed_assets = 0
    
    total_assets = total_current_assets + total_fixed_assets
    
    # LIABILITIES
    ap = await db.invoices.aggregate([
        {"$match": {"type": "purchase", "status": {"$in": ["unpaid", "partial"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    ap_total = ap[0]["total"] if ap else 0
    
    current_liabilities = [
        {"name": "Accounts Payable", "amount": round(ap_total, 2)},
    ]
    total_current_liabilities = ap_total
    
    long_term_liabilities = []
    total_long_term_liabilities = 0
    
    total_liabilities = total_current_liabilities + total_long_term_liabilities
    
    # EQUITY
    # Calculate retained earnings from P&L
    sales = await db.sales_orders.aggregate([
        {"$match": {"status": {"$in": ["delivered", "paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    revenue = sales[0]["total"] if sales else 0
    
    expenses = await db.expenses.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_expenses = expenses[0]["total"] if expenses else 0
    
    cogs = await db.purchase_orders.aggregate([
        {"$match": {"status": {"$in": ["received", "paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    cogs_total = cogs[0]["total"] if cogs else 0
    
    net_income = revenue - cogs_total - total_expenses
    
    equity_items = [
        {"name": "Capital", "amount": 0},
        {"name": "Retained Earnings", "amount": round(net_income, 2)},
    ]
    total_equity = net_income
    
    return {
        "report_date": date.isoformat(),
        "assets": {
            "current_assets": current_assets,
            "total_current_assets": round(total_current_assets, 2),
            "fixed_assets": fixed_assets,
            "total_fixed_assets": round(total_fixed_assets, 2),
            "total_assets": round(total_assets, 2)
        },
        "liabilities": {
            "current_liabilities": current_liabilities,
            "total_current_liabilities": round(total_current_liabilities, 2),
            "long_term_liabilities": long_term_liabilities,
            "total_long_term_liabilities": round(total_long_term_liabilities, 2),
            "total_liabilities": round(total_liabilities, 2)
        },
        "equity": {
            "items": equity_items,
            "total_equity": round(total_equity, 2)
        },
        "total_liabilities_and_equity": round(total_liabilities + total_equity, 2),
        "is_balanced": abs(total_assets - (total_liabilities + total_equity)) < 0.01
    }

# ========================
# SUPPLIER/DISTRIBUTOR PERFORMANCE API
# ========================

@api_router.get("/reports/supplier-performance")
async def get_supplier_performance(user: User = Depends(get_current_user)):
    """Get supplier performance dashboard data"""
    suppliers = await db.suppliers.find({}).to_list(100)
    
    performance_data = []
    for supplier in suppliers:
        supplier_id = supplier["supplier_id"]
        
        # Get PO statistics
        pos = await db.purchase_orders.find({"supplier_id": supplier_id}).to_list(1000)
        total_orders = len(pos)
        total_value = sum(po.get("total_amount", 0) for po in pos)
        
        # Calculate on-time delivery
        grns = await db.grns.find({"supplier_id": supplier_id}).to_list(1000)
        on_time = 0
        late = 0
        for grn in grns:
            po = next((p for p in pos if p["po_id"] == grn["po_id"]), None)
            if po and po.get("expected_date"):
                if grn.get("received_date", datetime.now(timezone.utc)) <= po["expected_date"]:
                    on_time += 1
                else:
                    late += 1
        
        # Calculate quality (accepted vs rejected)
        total_accepted = sum(sum(item.get("accepted_quantity", 0) for item in grn.get("items", [])) for grn in grns)
        total_rejected = sum(sum(item.get("rejected_quantity", 0) for item in grn.get("items", [])) for grn in grns)
        quality_rate = (total_accepted / (total_accepted + total_rejected) * 100) if (total_accepted + total_rejected) > 0 else 100
        
        # Delivery rate
        delivery_rate = (on_time / (on_time + late) * 100) if (on_time + late) > 0 else 100
        
        performance_data.append({
            "supplier_id": supplier_id,
            "supplier_name": supplier["name"],
            "total_orders": total_orders,
            "total_value": round(total_value, 2),
            "on_time_deliveries": on_time,
            "late_deliveries": late,
            "delivery_rate": round(delivery_rate, 1),
            "quality_rate": round(quality_rate, 1),
            "overall_score": round((delivery_rate + quality_rate) / 2, 1),
            "rating": supplier.get("rating", 0)
        })
    
    # Sort by overall score
    performance_data.sort(key=lambda x: x["overall_score"], reverse=True)
    
    return {
        "suppliers": performance_data,
        "summary": {
            "total_suppliers": len(performance_data),
            "avg_delivery_rate": round(sum(p["delivery_rate"] for p in performance_data) / len(performance_data), 1) if performance_data else 0,
            "avg_quality_rate": round(sum(p["quality_rate"] for p in performance_data) / len(performance_data), 1) if performance_data else 0,
            "top_performer": performance_data[0]["supplier_name"] if performance_data else None
        }
    }

@api_router.get("/reports/distributor-performance")
async def get_distributor_performance(user: User = Depends(get_current_user)):
    """Get distributor performance dashboard data"""
    distributors = await db.distributors.find({}).to_list(100)
    
    performance_data = []
    for dist in distributors:
        dist_id = dist["distributor_id"]
        
        # Get SO statistics
        sos = await db.sales_orders.find({"distributor_id": dist_id}).to_list(1000)
        total_orders = len(sos)
        total_value = sum(so.get("total_amount", 0) for so in sos)
        
        # Get invoices for payment analysis
        invoices = await db.invoices.find({"entity_id": dist_id, "type": "sale"}).to_list(1000)
        paid_invoices = [inv for inv in invoices if inv.get("status") == "paid"]
        unpaid_value = sum(inv.get("total_amount", 0) for inv in invoices if inv.get("status") in ["unpaid", "partial"])
        
        # Calculate payment rate
        payment_rate = (len(paid_invoices) / len(invoices) * 100) if invoices else 100
        
        # Calculate average order value
        avg_order_value = total_value / total_orders if total_orders > 0 else 0
        
        # Get delivery info
        deliveries = await db.delivery_notes.find({"distributor_id": dist_id}).to_list(1000)
        completed_deliveries = len([d for d in deliveries if d.get("status") == "delivered"])
        
        performance_data.append({
            "distributor_id": dist_id,
            "distributor_name": dist["name"],
            "territory": dist.get("territory", "N/A"),
            "total_orders": total_orders,
            "total_value": round(total_value, 2),
            "avg_order_value": round(avg_order_value, 2),
            "total_invoices": len(invoices),
            "paid_invoices": len(paid_invoices),
            "payment_rate": round(payment_rate, 1),
            "outstanding_balance": round(unpaid_value, 2),
            "completed_deliveries": completed_deliveries,
            "credit_limit": dist.get("credit_limit", 0),
            "commission_rate": dist.get("commission_rate", 0)
        })
    
    # Sort by total value
    performance_data.sort(key=lambda x: x["total_value"], reverse=True)
    
    return {
        "distributors": performance_data,
        "summary": {
            "total_distributors": len(performance_data),
            "total_revenue": round(sum(p["total_value"] for p in performance_data), 2),
            "total_outstanding": round(sum(p["outstanding_balance"] for p in performance_data), 2),
            "avg_payment_rate": round(sum(p["payment_rate"] for p in performance_data) / len(performance_data), 1) if performance_data else 0,
            "top_performer": performance_data[0]["distributor_name"] if performance_data else None
        }
    }

# ========================
# HEALTH CHECK
# ========================

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    """Initialize database indexes"""
    # Create indexes for better performance
    await db.products.create_index("sku", unique=True)
    await db.products.create_index("barcode")
    await db.products.create_index("category")
    await db.inventory_stock.create_index([("product_id", 1), ("warehouse_id", 1)])
    await db.purchase_orders.create_index("po_number", unique=True)
    await db.sales_orders.create_index("so_number", unique=True)
    await db.invoices.create_index("invoice_number", unique=True)
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token")
    logger.info("Database indexes created")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
