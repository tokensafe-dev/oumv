package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"ecommerce-app/backend/internal/api"
	"ecommerce-app/backend/internal/repository"
	"ecommerce-app/backend/internal/service"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/ecommerce?sslmode=disable"
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("failed to connect to db: %v", err)
	}
	defer db.Close()

	repo := repository.NewPostgresOrderRepository(db)
	svc := service.NewOrderService(repo)
	handler := api.NewCheckoutHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/checkout", handler.HandleCheckout)

	log.Println("E-Commerce Server running on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
