package com.prakash.sdk;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Prakash Billing System - Java SDK
 * For Central Dashboard Integration
 */
public class PrakashSDK {
    private final String tenantId;
    private final String apiKey;
    private final String endpoint;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public PrakashSDK(String tenantId, String apiKey, String endpoint) {
        if (tenantId == null || tenantId.isEmpty()) {
            throw new IllegalArgumentException("Tenant ID is required.");
        }
        this.tenantId = tenantId;
        this.apiKey = apiKey;
        this.endpoint = (endpoint != null && !endpoint.isEmpty()) 
            ? endpoint 
            : "https://dashboard.prakash.com/api/central/ingest";
        
        this.httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_2)
            .connectTimeout(Duration.ofSeconds(10))
            .build();
        this.objectMapper = new ObjectMapper();
    }

    public void logSubmission(String documentId, String status, Map<String, Object> details) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("tenantId", this.tenantId);
        payload.put("eventType", "submission");
        payload.put("documentId", documentId);
        payload.put("status", status);
        payload.put("details", details);

        sendEvent(payload);
    }

    public void logError(String context, Exception error) {
        Map<String, Object> details = new HashMap<>();
        details.put("context", context);
        details.put("errorMessage", error.getMessage());
        
        // Simplified stack trace
        if (error.getStackTrace().length > 0) {
            details.put("stack", error.getStackTrace()[0].toString());
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("tenantId", this.tenantId);
        payload.put("eventType", "error");
        payload.put("status", "failure");
        payload.put("details", details);

        sendEvent(payload);
    }

    private void sendEvent(Map<String, Object> payload) {
        try {
            String jsonPayload = objectMapper.writeValueAsString(payload);
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(this.endpoint))
                .timeout(Duration.ofMinutes(1))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + (this.apiKey != null ? this.apiKey : ""))
                .header("X-Tenant-ID", this.tenantId)
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

            httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(HttpResponse::body)
                .thenAccept(System.out::println)
                .exceptionally(e -> {
                    System.err.println("Failed to log event to Prakash Dashboard: " + e.getMessage());
                    return null;
                });

        } catch (Exception e) {
            System.err.println("Error constructing request: " + e.getMessage());
        }
    }
    
    // Usage Example
    public static void main(String[] args) {
        PrakashSDK sdk = new PrakashSDK("test-tenant-123", "secret-key", null);
        Map<String, Object> details = new HashMap<>();
        details.put("amount", 1000);
        sdk.logSubmission("INV-2024-001", "success", details);
    }
}
