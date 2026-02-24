package com.theweddingtree.backend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "contact")
public class Contact {

    @Id
    private String id;

    private String name;
    private String email;
    private String phone;
    private String eventType;
    private String message;

    public Contact() {
    }

    public Contact(String name, String email, String phone, String eventType, String message) {
        this.name = name;
        this.email = email;
        this.phone = phone;
        this.eventType = eventType;
        this.message = message;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}