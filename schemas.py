from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class StationBase(BaseModel):
    name: str
    location: Optional[str] = None

class StationCreate(StationBase):
    pass

class Station(StationBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        orm_mode = True

class PartnerBase(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None

class PartnerCreate(PartnerBase):
    pass

class Partner(PartnerBase):
    id: int
    created_at: datetime
    class Config:
        orm_mode = True

class EmployeeBase(BaseModel):
    station_id: int
    full_name: str
    role: Optional[str] = None
    username: Optional[str] = None
    salary: Optional[float] = None

class EmployeeCreate(EmployeeBase):
    password: str

class Employee(EmployeeBase):
    id: int
    is_active: bool
    created_at: datetime
    class Config:
        orm_mode = True

class SaleBase(BaseModel):
    station_id: int
    quantity: float
    unit_price: float
    total_amount: float
    payment_type: Optional[str] = None
    shift_date: Optional[str] = None

class SaleCreate(SaleBase):
    pass

class Sale(SaleBase):
    id: int
    created_at: datetime
    sync_status: str
    class Config:
        orm_mode = True