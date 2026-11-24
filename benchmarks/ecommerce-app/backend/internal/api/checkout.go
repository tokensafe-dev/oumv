package api

import (
	"encoding/json"
	"net/http"
	"ecommerce-app/backend/internal/domain"
	"ecommerce-app/backend/internal/service"
)

type CheckoutHandler struct {
	svc *service.OrderService
}

func NewCheckoutHandler(svc *service.OrderService) *CheckoutHandler {
	return &CheckoutHandler{svc: svc}
}

// HandleCheckout processes POST /api/v1/checkout
func (h *CheckoutHandler) HandleCheckout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req domain.CheckoutDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	order, err := h.svc.ProcessCheckout(r.Context(), req)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusUnprocessableEntity)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"orderId":    order.ID,
		"status":     order.Status,
		"totalCents": order.TotalCents,
		"createdAt":  order.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	})
}
