package com.theweddingtree.backend.controller;

import com.theweddingtree.backend.model.Contact;
import com.theweddingtree.backend.repository.ContactRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ContactController {

    @Autowired
    private ContactRepository contactRepository;

    @PostMapping("/contact")
    public ResponseEntity<Contact> saveContact(@RequestBody Contact contact) {
        Contact saved = contactRepository.save(contact);
        return ResponseEntity.ok(saved);
    }
}