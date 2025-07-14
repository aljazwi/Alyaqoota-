from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import station, partner, employee, sale

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(station.router)
app.include_router(partner.router)
app.include_router(employee.router)
app.include_router(sale.router)

@app.get("/")
def root():
    return {"message": "Fuel Station Management System API"}