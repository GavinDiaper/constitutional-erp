# **🔐 Login API Specification (Canvas + Admin)**

This specification defines the authentication and actor‑binding flow for the Canvas UI and Admin Interface.

It is designed to be:

- **Simple** (username/password)
- **Stateless** (JWT)
- **Actor‑aware** (FoundationERP actor lookup)
- **Governance‑aligned** (authority tier included)
- **Admin‑gated** (`principal.system` only)

---

# **1. Overview**

### **Purpose**
Authenticate a human user and bind them to a **FoundationERP actor**, which determines:

- Their **authority tier**
- Their **domain access**
- Whether they can access **Admin pages**

### **Flow Summary**

1. User submits username/password  
2. UI backend validates credentials  
3. Backend resolves actor via FoundationERP  
4. Backend issues JWT containing actor context  
5. Canvas uses JWT for all subsequent API calls  
6. Admin access allowed only if `actorId === "principal.system"`

---

# **2. Endpoints**

## **POST /auth/login**

Authenticates the user and returns a JWT containing actor context.

### **Request**

**Headers**
```
Content-Type: application/json
```

**Body**
```json
{
  "username": "gavin",
  "password": "secret123"
}
```

### **Response (200 OK)**

```json
{
  "token": "<jwt-token>",
  "actor": {
    "actorId": "actor-123",
    "name": "Gavin",
    "authorityTier": 3,
    "domains": ["p2p", "o2c", "r2r"]
  }
}
```

### **Response (401 Unauthorized)**

```json
{
  "error": "invalid_credentials",
  "message": "Username or password is incorrect."
}
```

---

## **POST /auth/logout**

Invalidates the session (if using server‑side sessions) or instructs the client to delete the JWT.

### **Response (200 OK)**

```json
{
  "status": "logged_out"
}
```

---

## **GET /auth/me**

Returns the actor context for the current session.

### **Headers**
```
Authorization: Bearer <jwt-token>
```

### **Response (200 OK)**

```json
{
  "actorId": "actor-123",
  "name": "Gavin",
  "authorityTier": 3,
  "domains": ["p2p", "o2c", "r2r"],
  "isAdmin": false
}
```

---

# **3. JWT Structure**

### **JWT Payload**

```json
{
  "sub": "gavin",
  "actorId": "actor-123",
  "authorityTier": 3,
  "domains": ["p2p", "o2c", "r2r"],
  "isAdmin": false,
  "iat": 1711780000,
  "exp": 1711787200
}
```

### **Admin Rule**

```
isAdmin = (actorId === "principal.system")
```

This is the only place where Admin access is determined.

---

# **4. Actor Lookup (FoundationERP)**

After validating username/password, the backend must call:

### **GET /internal/actors/by-username/:username**

**Example response:**

```json
{
  "actorId": "actor-123",
  "name": "Gavin",
  "authorityTier": 3,
  "domains": ["p2p", "o2c", "r2r"]
}
```

If no actor exists:

### **Response (404)**

```json
{
  "error": "actor_not_found",
  "message": "No actor is associated with this username."
}
```

---

# **5. Middleware**

## **authRequired**

Validates JWT and attaches actor context to the request.

### **Adds to req:**

```
req.actor = {
  actorId,
  authorityTier,
  domains,
  isAdmin
}
```

---

## **adminOnly**

Allows access only if:

```
req.actor.isAdmin === true
```

### **Response (403)**

```json
{
  "error": "forbidden",
  "message": "Admin access required."
}
```

---

# **6. Canvas → Backend → Integration Hub Contract**

Every Canvas request to Integration Hub must include:

```
x-actor-id: <actorId>
x-actor-tier: <authorityTier>
Authorization: Bearer <jwt-token>
```

Navigator v2 and Integration Hub v2 already support this.

---

# **7. Security Considerations**

### **Password storage**
- Use bcrypt or argon2
- Never store plaintext passwords

### **JWT**
- Short expiry (e.g., 2 hours)
- Refresh token optional (Phase J)

### **Transport**
- HTTPS only

### **Admin access**
- Hard‑coded rule:
  ```
  actorId === "principal.system"
  ```

### **Brute force protection**
- Rate limit login attempts

---

# **8. Optional Future Enhancements**

These are *not* needed now, but easy to add later:

- SSO via Azure AD / Entra ID
- MFA
- Refresh tokens
- Role‑based UI customization
- Audit logs for login events

---

# **9. Summary**

This Login API spec gives you:

- A clean, simple login flow  
- Actor binding via FoundationERP  
- JWT‑based session management  
- Admin gating via `principal.system`  
- Full alignment with Navigator v2 and Integration Hub v2  
- Zero IAM complexity  


