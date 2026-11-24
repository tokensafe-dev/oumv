package domain

import "time"

type PaymentMethod string

const (
	PaymentMethodCard     PaymentMethod = "card"
	PaymentMethodApplePay PaymentMethod = "apple_pay"
	PaymentMethodCrypto   PaymentMethod = "crypto"
)

type OrderItem struct {
	ID         int64  `json:"id"`
	OrderID    string `json:"orderId"`
	SKU        string `json:"sku"`
	Name       string `json:"name"`
	PriceCents int64  `json:"priceCents"`
	Quantity   int    `json:"quantity"`
}

type Order struct {
	ID            string        `json:"id"`
	CustomerID    string        `json:"customerId"`
	Status        string        `json:"status"`
	PaymentMethod PaymentMethod `json:"paymentMethod"`
	Phone         string        `json:"phone"`
	TotalCents    int64         `json:"totalCents"`
	CreatedAt     time.Time     `json:"createdAt"`
	Items         []OrderItem   `json:"items"`
}

type CheckoutDTO struct {
	CartID          string        `json:"cartId"`
	CustomerID      string        `json:"customerId"`
	PaymentMethod   PaymentMethod `json:"paymentMethod"`
	Phone           string        `json:"phone"`
	ShippingAddress struct {
		Street     string `json:"street"`
		City       string `json:"city"`
		PostalCode string `json:"postalCode"`
		Country    string `json:"country"`
	} `json:"shippingAddress"`
}
