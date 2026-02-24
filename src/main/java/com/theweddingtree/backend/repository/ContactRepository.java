package com.theweddingtree.backend.repository;

import com.theweddingtree.backend.model.Contact;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ContactRepository extends MongoRepository<Contact, String> {
}
