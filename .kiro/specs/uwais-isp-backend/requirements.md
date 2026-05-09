# Requirements Document

## Introduction

UwaisSuperApps is a comprehensive Billing ISP backend system built with Express.js, MySQL, and FreeRADIUS. The backend provides REST APIs consumed by a responsive Web frontend, a Customer Mobile App, and a Technician Mobile App. The system manages the complete ISP business lifecycle including customer management, service provisioning, billing automation, network control (RADIUS/CoA), asset tracking, helpdesk ticketing, infrastructure registration, KPI management, and regulatory reporting. All operations are scoped per Branch with role-based access control for Superadmin, Admin, Accounting, Mitra, Sales, Merchant, Teknisi, and Pelanggan.

## Glossary

- **Backend**: The Express.js + MySQL + FreeRADIUS server application exposing REST APIs
- **NAS**: Network Access Server — a Mikrotik router gateway that terminates PPPoE/Hotspot sessions via RADIUS
- **CoA**: Change of Authorization — a RADIUS mechanism to update session attributes in real-time via UDP port 3799
- **POD**: Packet of Disconnect — a RADIUS mechanism to forcefully disconnect a user session
- **PPPoE**: Point-to-Point Protocol over Ethernet — the authentication protocol used for customer internet sessions
- **OLT**: Optical Line Terminal — the central device in a fiber-optic network
- **ODP**: Optical Distribution Point (also called FAT) — a passive fiber distribution box in the field
- **ONU/ONT**: Optical Network Unit/Terminal — the customer-premises fiber modem device
- **ACS**: Auto Configuration Server — TR-069 compliant server for remote device management
- **FUP**: Fair Usage Policy — quota-based speed reduction after exceeding a data threshold
- **Isolir**: Service suspension/blocking due to unpaid bills, redirecting customer to a warning page
- **Prorata**: Proportional billing calculation for partial-month service activation
- **Tripay**: Third-party payment gateway supporting Virtual Account, QRIS, and minimarket payments
- **Branch**: A regional office/operational unit; all inventory and data are scoped per Branch
- **Mitra**: A partner entity that manages customers, receives payments, and earns flexible profit sharing; must maintain a prepaid balance (topup)
- **Merchant**: A payment collection point that receives payments on behalf of the ISP; earns admin-defined commission; must maintain a prepaid balance (topup)
- **Sales**: A sales agent who inputs customer data and acquires new subscribers
- **Teknisi**: A field technician who performs installations, repairs, and maintenance
- **Pelanggan**: An end-customer/subscriber of the ISP service
- **KPI**: Key Performance Indicator — measurable performance metrics for employees
- **RAB**: Rencana Anggaran Biaya — a budget plan/cost estimate for expansion projects
- **CAPEX**: Capital Expenditure — investment spending on infrastructure expansion
- **PPN**: Pajak Pertambahan Nilai — Indonesian Value Added Tax at 11%
- **Komdigi**: Indonesian telecommunications regulatory body requiring periodic reports
- **Address_List**: A Mikrotik firewall feature used to isolate/block customer traffic
- **Burst_Limit**: Maximum allowed speed during burst period in Mikrotik QoS
- **Burst_Threshold**: The average data rate threshold that triggers burst behavior
- **Rate_Limit**: The sustained maximum upload/download speed for a service package
- **SN**: Serial Number — unique identifier for hardware devices
- **MAC_Address**: Media Access Control address — unique hardware network identifier
- **Stock_Opname**: Physical inventory audit comparing system records to actual stock

## Requirements

### Requirement 1: Customer Lifecycle Management

**User Story:** As an Admin, I want to manage customer lifecycle states, so that I can track each customer from prospect through active service to termination.

#### Acceptance Criteria

1. THE Backend SHALL store customer records with lifecycle status values limited to: Prospek, Instalasi, Aktif, Isolir, and Terminated
2. WHEN a new customer record is created, THE Backend SHALL set the initial lifecycle status to Prospek
3. WHEN an Admin or Sales or Mitra updates a customer status, THE Backend SHALL validate that the transition follows the allowed sequence: Prospek → Instalasi → Aktif → Isolir ↔ Aktif, Aktif → Terminated, Isolir → Terminated
4. WHEN a customer status changes, THE Backend SHALL record the timestamp, the actor who performed the change, and the previous status in an audit log
5. IF an invalid status transition is requested, THEN THE Backend SHALL reject the request and return a descriptive error indicating the allowed transitions

### Requirement 2: Customer Database

**User Story:** As an Admin, I want to store comprehensive customer identity and location data, so that I can manage service delivery and regulatory compliance.

#### Acceptance Criteria

1. THE Backend SHALL store customer identity data including: full name, KTP number, NPWP number (optional), WhatsApp number, email address, physical address, and GPS coordinates (latitude/longitude) of the installation location
2. THE Backend SHALL enforce uniqueness on KTP number across all customer records
3. WHEN a customer record is created or updated, THE Backend SHALL validate that WhatsApp number follows Indonesian phone number format
4. THE Backend SHALL associate each customer with exactly one Branch
5. THE Backend SHALL associate each customer with the Sales, Mitra, or Admin who registered the customer

### Requirement 3: Multi-Service Per Customer

**User Story:** As an Admin, I want to support multiple service connections per customer account, so that one customer can have multiple PPPoE sessions at different locations.

#### Acceptance Criteria

1. THE Backend SHALL support one-to-many relationship between a customer account and service subscriptions
2. WHEN a new service subscription is added to a customer, THE Backend SHALL generate a unique PPPoE account for that subscription
3. THE Backend SHALL store per-subscription data including: PPPoE username, assigned package, ODP port, ONU serial number, NAS assignment, and installation location GPS coordinates
4. THE Backend SHALL link each service subscription to the ACS system using the PPPoE account as the identifier

### Requirement 4: Service Package Management

**User Story:** As a Superadmin, I want to define internet service packages with detailed QoS parameters, so that I can offer differentiated speed tiers to customers.

#### Acceptance Criteria

1. THE Backend SHALL store service package definitions with parameters: package name, upload Rate_Limit, download Rate_Limit, upload Burst_Limit, download Burst_Limit, upload Burst_Threshold, download Burst_Threshold, monthly price, and active/inactive status
2. WHEN a package is created or updated, THE Backend SHALL validate that Burst_Limit is greater than or equal to Rate_Limit
3. WHEN a package is created or updated, THE Backend SHALL validate that Burst_Threshold is less than or equal to Rate_Limit
4. THE Backend SHALL support enabling or disabling FUP per package with configurable quota threshold (in GB) and reduced speed values
5. THE Backend SHALL prevent deletion of a package that has active customer subscriptions assigned to the package

### Requirement 5: Prorata Billing Calculation

**User Story:** As an Admin, I want the system to calculate proportional billing for mid-month activations, so that customers are charged fairly for partial months.

#### Acceptance Criteria

1. WHEN a customer service is activated mid-month and prorata is enabled, THE Backend SHALL calculate the first month charge as: (monthly_price / total_days_in_month) * remaining_days_in_month
2. WHEN prorata is disabled for a Branch or customer, THE Backend SHALL charge the full monthly price regardless of activation date
3. THE Backend SHALL store the prorata configuration as a system-level setting that Superadmin can enable or disable

### Requirement 6: Billing Cycle and Auto-Generation

**User Story:** As an Accounting user, I want invoices to be generated automatically on the 1st of each month, so that billing is consistent and requires no manual intervention.

#### Acceptance Criteria

1. THE Backend SHALL execute a scheduled job at 00:00 on the 1st of every month to generate invoices for all active customer subscriptions
2. WHEN generating an invoice, THE Backend SHALL calculate the total amount as: package monthly price + PPN (11% of package price) for customers with PPN enabled
3. WHEN generating an invoice, THE Backend SHALL set the invoice status to UNPAID and the due date to the 10th of the same month
4. THE Backend SHALL store each invoice with: invoice number, customer ID, subscription ID, billing period, base amount, PPN amount, total amount, status, generation date, and due date
5. WHEN an invoice is generated, THE Backend SHALL queue a WhatsApp notification to the customer containing the invoice details and payment instructions
6. WHEN a customer has been subscribed for 2 months or fewer, THE Backend SHALL send notifications via both WhatsApp and email; WHEN a customer has been subscribed for more than 2 months, THE Backend SHALL send notifications via mobile app push notification only

### Requirement 7: Auto-Isolir Scheduled Job

**User Story:** As a Superadmin, I want the system to automatically suspend service for customers with unpaid bills, so that revenue collection is enforced consistently.

#### Acceptance Criteria

1. THE Backend SHALL execute a scheduled job at 23:59 on the 10th of every month to identify all subscriptions with UNPAID invoices past due date
2. WHEN the auto-isolir job identifies an unpaid subscription, THE Backend SHALL send a CoA request to the assigned NAS to add the customer PPPoE session to the isolir Address_List
3. WHEN auto-isolir is executed, THE Backend SHALL update the customer lifecycle status to Isolir and record the isolir timestamp
4. WHEN auto-isolir is executed, THE Backend SHALL send a notification to the customer informing them of the service suspension
5. IF the CoA request to the NAS fails, THEN THE Backend SHALL retry the request up to 3 times with exponential backoff and log the failure for manual review

### Requirement 8: Payment Gateway Integration (Tripay)

**User Story:** As a Pelanggan, I want to pay my invoice through multiple payment channels, so that I can choose the most convenient payment method.

#### Acceptance Criteria

1. THE Backend SHALL integrate with the Tripay payment gateway to support Virtual Account, QRIS, and minimarket payment methods
2. WHEN a payment is initiated, THE Backend SHALL create a payment transaction with Tripay and return the payment instructions (VA number, QR code, or payment code) to the client
3. WHEN Tripay sends a payment callback confirming successful payment, THE Backend SHALL update the invoice status to LUNAS and record the payment timestamp and method
4. WHEN an invoice is marked LUNAS and the customer status is Isolir, THE Backend SHALL automatically trigger a CoA request to the NAS to remove the customer from the isolir Address_List and restore service
5. IF a Tripay callback contains an invalid signature, THEN THE Backend SHALL reject the callback and log the attempt as a security event

### Requirement 9: Mitra Payment and Profit Sharing

**User Story:** As a Mitra, I want to receive customer payments and earn profit sharing, so that I can operate as a local partner for the ISP.

#### Acceptance Criteria

1. THE Backend SHALL maintain a prepaid balance (saldo) for each Mitra account
2. WHEN a Mitra tops up their balance, THE Backend SHALL record the topup transaction and increase the Mitra saldo
3. WHEN a Mitra receives a customer payment, THE Backend SHALL deduct the payment amount from the Mitra saldo and mark the customer invoice as LUNAS
4. THE Backend SHALL calculate Mitra profit sharing as a flexible percentage of the package price, configured per Mitra at account creation time
5. THE Backend SHALL generate a revenue report for each Mitra showing: total payments received, profit sharing earned, current saldo balance, and transaction history
6. IF a Mitra attempts to process a payment exceeding their available saldo, THEN THE Backend SHALL reject the transaction and return an insufficient balance error

### Requirement 10: Merchant Payment and Commission

**User Story:** As a Merchant, I want to collect customer payments and earn commission, so that I can serve as a payment collection point.

#### Acceptance Criteria

1. THE Backend SHALL maintain a prepaid balance (saldo) for each Merchant account
2. WHEN a Merchant tops up their balance, THE Backend SHALL record the topup transaction and increase the Merchant saldo
3. WHEN a Merchant processes a customer payment, THE Backend SHALL deduct the amount from the Merchant saldo, mark the invoice as LUNAS, and display the admin fee (commission) on the invoice
4. THE Backend SHALL calculate Merchant commission as a fixed amount per transaction defined by Admin
5. IF a Merchant attempts to process a payment exceeding their available saldo, THEN THE Backend SHALL reject the transaction and return an insufficient balance error

### Requirement 11: Bill Waiver for Extended Isolir

**User Story:** As an Accounting user, I want bills to be waived for customers isolated longer than one month, so that customers are not charged for service they did not receive.

#### Acceptance Criteria

1. WHEN a customer has been in Isolir status for more than 1 month and then makes a payment, THE Backend SHALL waive (cancel) all invoices generated during the isolir period
2. WHEN invoices are waived, THE Backend SHALL record the waiver with reason "Extended Isolir" and the waived amount for audit purposes
3. WHEN a customer has unpaid invoices for 2 consecutive months (arrears), THE Backend SHALL send a service termination notification to the customer
4. WHEN a customer reaches 2-month arrears, THE Backend SHALL automatically create a device withdrawal ticket assigned to the relevant Branch technician team


### Requirement 12: RADIUS and NAS Integration

**User Story:** As a Superadmin, I want to register and manage NAS devices centrally, so that new routers can be provisioned and monitored from the backend.

#### Acceptance Criteria

1. THE Backend SHALL store NAS records with: name, IP address, RADIUS secret, API port, Branch assignment, status (Active/Inactive), and associated VPN accounts
2. WHEN a new NAS is registered, THE Backend SHALL automatically create 4 VPN accounts with different service types configured as failover connections to the central server
3. WHEN a new NAS is registered, THE Backend SHALL generate a Mikrotik configuration script containing: 4 VPN failover settings, RADIUS secret, API port configuration, auto-isolir Address_List rules, PPPoE server profile, and Hotspot user profile
4. THE Backend SHALL expose an API endpoint to download the generated NAS configuration script
5. WHEN a NAS is registered and configured, THE Backend SHALL perform a connectivity test (API and RADIUS via VPN) and report the result
6. IF the NAS connectivity test fails, THEN THE Backend SHALL set the NAS status to Inactive and return diagnostic information
7. WHEN a NAS is set to Active status, THE Backend SHALL allow Superadmin to allocate IP pools and assign service packages to the NAS

### Requirement 13: Change of Authorization (CoA) Engine

**User Story:** As an Admin, I want the system to send real-time network updates to NAS devices, so that customer session attributes are modified without manual router access.

#### Acceptance Criteria

1. THE Backend SHALL support sending CoA-Request packets to NAS devices via UDP port 3799 for the following triggers: package speed change, payment confirmation (isolir removal), and auto-isolir activation
2. THE Backend SHALL support sending Packet of Disconnect (POD) to NAS devices for manual session kick operations
3. WHEN a CoA-Request is sent, THE Backend SHALL wait for a CoA-ACK (success) or CoA-NAK (failure) response from the NAS
4. IF a CoA-NAK response is received, THEN THE Backend SHALL queue the CoA request for automatic retry with a maximum of 3 attempts
5. THE Backend SHALL log all CoA/POD operations with: timestamp, trigger type, target NAS, target customer session, request payload, response status, and retry count
6. WHEN a CoA operation succeeds, THE Backend SHALL update the system dashboard status to reflect the current session state

### Requirement 14: NAS Monitoring

**User Story:** As an Admin, I want to monitor the status of all NAS devices from a central dashboard, so that I can detect and respond to network outages quickly.

#### Acceptance Criteria

1. THE Backend SHALL periodically poll all active NAS devices to determine their Up/Down status
2. THE Backend SHALL expose an API endpoint returning the current status of all NAS devices including: name, IP, Branch, status (Up/Down), last successful poll timestamp, and active session count
3. WHEN a NAS transitions from Up to Down status, THE Backend SHALL generate an alert event and log the outage start time
4. WHEN a NAS transitions from Down to Up status, THE Backend SHALL log the outage end time and calculate the downtime duration

### Requirement 15: ACS Integration (TR-069)

**User Story:** As an Admin, I want to remotely manage customer ONU/ONT devices via TR-069, so that I can perform diagnostics and configuration changes without dispatching a technician.

#### Acceptance Criteria

1. THE Backend SHALL link each customer service subscription to the ACS system using the PPPoE username as the device identifier
2. THE Backend SHALL expose API endpoints to trigger ACS operations including: device reboot, WiFi SSID change, WiFi password change, and firmware update
3. WHEN an ACS operation is triggered, THE Backend SHALL send the appropriate TR-069 command to the ACS server and return the operation status
4. THE Backend SHALL store ACS device information per subscription including: device model, firmware version, last contact timestamp, and connection status

### Requirement 16: Customer Activation Flow (New Installation)

**User Story:** As a Sales/Mitra/Admin, I want to register a new customer and trigger the installation workflow, so that the customer can be activated with minimal manual steps.

#### Acceptance Criteria

1. WHEN a new customer is registered, THE Backend SHALL automatically map the customer to the appropriate Branch or Mitra based on the coverage area
2. WHEN a coverage check is performed, THE Backend SHALL verify that an active ODP with available ports exists within the customer GPS coordinates coverage area
3. WHEN a customer agrees to subscribe, THE Backend SHALL allow recording of a Down Payment (DP) amount and payment
4. WHEN an installation schedule is created, THE Backend SHALL automatically generate a PPPoE account with unique credentials
5. WHEN a Teknisi completes installation, THE Backend SHALL accept installation data including: ODP number, ODP port number, ONU serial number, ONU photo, and MAC address binding
6. WHEN installation data is validated by Admin, THE Backend SHALL calculate the first invoice considering: prorata (if enabled), installation fee (if enabled), DP deduction (if applicable), and add-on service charges (if any)
7. WHEN the first invoice is generated, THE Backend SHALL send a WhatsApp notification to the customer with payment details
8. WHEN the first invoice is paid, THE Backend SHALL activate the PPPoE account on the assigned NAS via CoA and set the customer status to Aktif

### Requirement 17: Package Change (Upgrade/Downgrade)

**User Story:** As a Pelanggan, I want to request a package upgrade or downgrade, so that I can adjust my internet speed to my current needs.

#### Acceptance Criteria

1. WHEN a package change request is submitted, THE Backend SHALL check the customer change history for the current month
2. IF the customer has already changed packages once in the current calendar month, THEN THE Backend SHALL reject the request with a message indicating the limit of 1 change per month has been reached
3. WHEN a valid package change request is submitted, THE Backend SHALL set the request status to "Menunggu Konfirmasi Admin" and notify the assigned Admin
4. WHEN an Admin approves a package change, THE Backend SHALL update the customer subscription profile, calculate billing adjustments for the next invoice, and trigger a CoA request to the NAS to apply the new speed limits
5. WHEN an Admin rejects a package change, THE Backend SHALL record the rejection reason and notify the customer
6. WHEN a package change CoA is successfully applied, THE Backend SHALL notify the customer that the new package is active

### Requirement 18: Asset Inbound (Inventory Receiving)

**User Story:** As an Admin Gudang, I want to record incoming inventory with proper categorization and serial number tracking, so that all assets are accounted for per Branch.

#### Acceptance Criteria

1. THE Backend SHALL store asset inbound records with: invoice number, purchase date, invoice file attachment, supplier name, and Branch destination
2. WHEN assets are received, THE Backend SHALL categorize each item by type: Perangkat Aktif (unit/pcs), Kabel (roll with total meters per SN), or Aksesoris (pack with total pieces per pack)
3. WHEN an asset does not have a manufacturer serial number or MAC address, THE Backend SHALL auto-generate a serial number in the format: UBG-YYYYMMDD-XXXXXX where XXXXXX is a sequential number
4. WHEN assets are recorded, THE Backend SHALL update the Branch stock count and associate each item with its serial number or batch number
5. THE Backend SHALL store per-asset data including: product name, brand/model, category, serial number, MAC address (if applicable), status (Tersedia, Dipinjam, Terpasang, Rusak, Dalam Pengiriman), and Branch location

### Requirement 19: Asset Outbound for Installation

**User Story:** As a Teknisi, I want to request assets from the Branch warehouse for installation, so that I can perform customer installations with tracked materials.

#### Acceptance Criteria

1. WHEN a Teknisi requests assets for installation, THE Backend SHALL validate that sufficient stock exists in the Branch warehouse
2. WHEN an Admin Gudang approves an asset request, THE Backend SHALL update the asset status to "Dibawa Teknisi" and deduct from Branch stock based on category: Kabel per meter, Aksesoris per piece, Perangkat Aktif per unit
3. WHEN a Teknisi installs assets at a customer location, THE Backend SHALL accept actual usage data (cable meters used, accessories count used) and update asset status to "Terpasang" linked to the customer ID and Branch
4. WHEN there are remaining materials after installation, THE Backend SHALL process the return to Branch warehouse and update stock accordingly
5. WHEN a returned asset is inspected, THE Backend SHALL update its status to either "Tersedia" (functional) or "Rusak" (damaged/RMA)

### Requirement 20: Tool Lending Management

**User Story:** As a Teknisi, I want to borrow work tools from the warehouse, so that I can perform field operations with proper accountability.

#### Acceptance Criteria

1. WHEN a Teknisi requests to borrow a tool, THE Backend SHALL record the borrow request with: tool ID, Teknisi ID, borrow date, and expected return date
2. WHEN an Admin Gudang approves a tool borrow request, THE Backend SHALL update the tool status to "Dipinjam" with the assigned Teknisi/Team identifier
3. WHEN a tool is returned, THE Backend SHALL record the return date and the physical condition assessment
4. IF a returned tool is damaged or lost, THEN THE Backend SHALL update the tool status to "Rusak/Hilang" and record the responsible Teknisi/Team for accountability
5. THE Backend SHALL expose an API endpoint listing all currently borrowed tools per Branch with borrower information and borrow duration

### Requirement 21: Inter-Branch Asset Transfer

**User Story:** As an Admin Branch, I want to transfer assets between branches, so that inventory can be redistributed based on operational needs.

#### Acceptance Criteria

1. WHEN an inter-branch transfer is initiated, THE Backend SHALL create a transfer record (surat jalan) with: source Branch, destination Branch, list of items with serial numbers, and transfer date
2. WHEN a transfer is processed, THE Backend SHALL deduct stock from the source Branch and set item status to "Dalam Pengiriman"
3. WHEN the destination Branch confirms receipt, THE Backend SHALL add stock to the destination Branch and set item status to "Tersedia"
4. WHEN a return transfer is needed (wrong item or surplus), THE Backend SHALL support creating a return transfer record that reverses the stock movement back to the source Branch
5. THE Backend SHALL maintain a complete transfer history with timestamps for each status change

### Requirement 22: Direct Sales (Non-Subscription)

**User Story:** As an Admin/Sales, I want to sell inventory items directly to customers without a subscription, so that the Branch can generate revenue from hardware sales.

#### Acceptance Criteria

1. WHEN a direct sale is initiated, THE Backend SHALL record the transaction with: customer data, item list with serial numbers, payment method (Cash or Credit/Hutang), and Branch
2. WHEN payment method is Cash, THE Backend SHALL record the revenue as Branch cash income
3. WHEN payment method is Credit/Hutang, THE Backend SHALL record the amount as customer receivable (piutang)
4. WHEN a direct sale is completed, THE Backend SHALL deduct the sold items from Branch stock based on category (Kabel per meter, Aksesoris per piece, Perangkat per unit)
5. THE Backend SHALL store the transaction history linked to the customer profile

### Requirement 23: Stock Opname (Inventory Audit)

**User Story:** As an Admin Gudang, I want to perform physical inventory audits, so that I can identify and resolve discrepancies between system records and actual stock.

#### Acceptance Criteria

1. THE Backend SHALL expose API endpoints to initiate a stock opname session for a specific Branch
2. WHEN a stock opname is in progress, THE Backend SHALL accept physical count entries per item category and compare them against system records
3. WHEN discrepancies are found between physical count and system records, THE Backend SHALL generate an adjustment journal recording: item, system quantity, physical quantity, difference, and reason
4. WHEN a stock opname is completed, THE Backend SHALL update system stock to match physical count and record the adjustment audit trail


### Requirement 24: Helpdesk Ticket Creation and Classification

**User Story:** As a Pelanggan or Teknisi, I want to submit trouble tickets, so that network issues are tracked and resolved systematically.

#### Acceptance Criteria

1. WHEN a ticket is submitted, THE Backend SHALL store: customer ID, issue description, submission timestamp, source (Pelanggan app, Teknisi app, Admin), and auto-assign a priority classification (VIP, High, Normal, Low)
2. THE Backend SHALL classify ticket priority based on configurable rules including: customer package tier, SLA level, and issue severity
3. THE Backend SHALL support multiple open tickets per customer simultaneously
4. WHEN a ticket is created, THE Backend SHALL notify the assigned Admin/CS team for initial analysis
5. THE Backend SHALL store ticket status with values: Open, In Progress, Pending (queued for next shift), Resolved, and Closed

### Requirement 25: Remote Troubleshooting via ACS/NAS

**User Story:** As an Admin, I want to resolve customer issues remotely when possible, so that technician dispatch is minimized for simple problems.

#### Acceptance Criteria

1. WHEN an Admin determines a ticket can be resolved remotely, THE Backend SHALL support triggering ACS commands (device restart, SSID change) or NAS commands (session kick, CoA) linked to the ticket
2. WHEN a remote fix is applied, THE Backend SHALL record the action taken in the ticket journal and send a confirmation notification to the customer
3. WHEN a remote fix resolves the issue, THE Backend SHALL allow the Admin to close the ticket with resolution type "Remote Fix"

### Requirement 26: Technician Dispatch and Multi-Ticket Assignment

**User Story:** As an Admin, I want to dispatch multiple tickets to a technician team grouped by area, so that field operations are efficient.

#### Acceptance Criteria

1. THE Backend SHALL support assigning multiple tickets to a single Teknisi or team as a grouped work order
2. WHEN tickets are dispatched, THE Backend SHALL send notifications to the assigned Teknisi via the mobile app
3. WHEN a ticket requires dispatch outside regular working hours and the ticket priority is High or VIP, THE Backend SHALL create an overtime approval request
4. IF overtime is approved, THEN THE Backend SHALL notify the Teknisi team and allow ticket processing
5. IF overtime is not approved, THEN THE Backend SHALL queue the ticket for the next available shift with status "Pending"
6. THE Backend SHALL support Teknisi updating ticket progress with: journal entries, photo evidence, and completion status (Selesai, Belum Selesai, Progress)
7. WHEN a Teknisi reports a specific damage type, THE Backend SHALL record the damage classification in the ticket for reporting purposes

### Requirement 27: Ticket Resolution and KPI Tracking

**User Story:** As a Superadmin, I want ticket resolution times tracked automatically, so that technician KPI can be measured accurately.

#### Acceptance Criteria

1. WHEN a ticket is resolved, THE Backend SHALL calculate the resolution time from ticket creation to resolution confirmation
2. THE Backend SHALL store resolution metrics per Teknisi including: total tickets resolved, average resolution time, and SLA compliance rate
3. WHEN a ticket is closed, THE Backend SHALL record the closing Admin, closure timestamp, and resolution category
4. THE Backend SHALL expose API endpoints for ticket reporting with filters: daily, weekly, monthly, yearly, by Branch, by Teknisi, and by priority level

### Requirement 28: OLT Registration

**User Story:** As a Superadmin/Admin Jaringan, I want to register OLT devices in the system, so that fiber network infrastructure is tracked and validated.

#### Acceptance Criteria

1. THE Backend SHALL store OLT records with: name, IP address, total PON ports, Branch assignment, and status (Active/Inactive)
2. WHEN an OLT is registered, THE Backend SHALL perform a ping/connectivity test to the OLT IP address
3. IF the OLT connectivity test fails, THEN THE Backend SHALL set the OLT status to Inactive and return an error indicating connectivity failure
4. WHEN the OLT connectivity test succeeds, THE Backend SHALL set the OLT status to Active

### Requirement 29: ODP/FAT Registration and Coverage Mapping

**User Story:** As a Teknisi/Admin, I want to register ODP/FAT devices with geolocation data, so that coverage areas are mapped for sales and installation planning.

#### Acceptance Criteria

1. THE Backend SHALL store ODP records with: name, GPS coordinates (latitude/longitude), total port capacity, used port count, mapped OLT PON port, Branch assignment, and status (Active/Inactive)
2. WHEN an ODP is registered, THE Backend SHALL validate that the mapped OLT PON port exists and belongs to an active OLT
3. WHEN an ODP is set to Active status, THE Backend SHALL make the coverage area available for sales coverage checks
4. THE Backend SHALL update the ODP used port count when a customer installation is linked to an ODP port
5. IF an ODP has reached full port capacity, THEN THE Backend SHALL exclude the ODP from coverage availability checks

### Requirement 30: WhatsApp Notification Integration

**User Story:** As a Superadmin, I want the system to send automated WhatsApp notifications, so that customers receive timely billing and service updates.

#### Acceptance Criteria

1. THE Backend SHALL maintain a notification queue for outbound WhatsApp messages
2. THE Backend SHALL support sending WhatsApp notifications for the following events: invoice generation, payment confirmation, isolir warning, service activation, installation schedule, and ticket updates
3. WHEN a notification is queued, THE Backend SHALL store: recipient WhatsApp number, message template, message parameters, status (Queued, Sent, Failed), and timestamp
4. IF a WhatsApp notification delivery fails, THEN THE Backend SHALL retry delivery up to 3 times and log the failure reason
5. THE Backend SHALL support broadcast messaging to multiple recipients for bulk notifications

### Requirement 31: Role-Based Access Control

**User Story:** As a Superadmin, I want to enforce role-based permissions on all API endpoints, so that each user type can only access authorized functions.

#### Acceptance Criteria

1. THE Backend SHALL authenticate all API requests using JWT tokens containing the user role and Branch assignment
2. THE Backend SHALL enforce the following role permissions:
   - Superadmin: full system access including NAS management, OLT management, package management, Branch management, and user management
   - Admin: CoA operations, customer management, asset management, ticketing management, inventory, billing management, and ACS usage scoped to their Branch
   - Accounting: billing management, customer data read access, and inventory read access
   - Mitra: new customer input, customer list (own customers only), payment status, payment processing, revenue reports, and balance topup
   - Sales: network infrastructure read access (coverage availability), customer growth reports (own acquisitions), and customer data (own registrations)
   - Merchant: balance topup, payment processing by customer ID only, and payment reports
   - Teknisi: network infrastructure read access, customer data input, ticket list, customer activation, and work journal
   - Pelanggan: own customer data, own service data, own billing, WiFi password/SSID change, ticket submission, ticket history, and payment history
3. WHEN a user attempts to access an endpoint outside their role permissions, THE Backend SHALL return a 403 Forbidden response
4. THE Backend SHALL scope all data queries by Branch for roles that are Branch-specific (Admin, Accounting, Teknisi)

### Requirement 32: User Management

**User Story:** As a Superadmin, I want to create and manage user accounts for all roles, so that system access is controlled and auditable.

#### Acceptance Criteria

1. THE Backend SHALL store user accounts with: username, hashed password, full name, role, Branch assignment (where applicable), status (Active/Inactive), and creation timestamp
2. WHEN a Mitra account is created, THE Backend SHALL store the profit sharing percentage configuration
3. WHEN a Merchant account is created, THE Backend SHALL store the commission amount per transaction
4. THE Backend SHALL support password reset functionality with secure token-based verification
5. THE Backend SHALL log all authentication events including: login success, login failure, and token refresh

### Requirement 33: Branch Management

**User Story:** As a Superadmin, I want to manage Branch entities, so that all operations and data are properly scoped to regional offices.

#### Acceptance Criteria

1. THE Backend SHALL store Branch records with: name, address, contact information, and status (Active/Inactive)
2. THE Backend SHALL enforce Branch scoping on all inventory, customer, billing, and ticket data
3. WHEN a Branch is deactivated, THE Backend SHALL prevent new customer registrations and asset movements to that Branch
4. THE Backend SHALL support assigning users, NAS devices, OLTs, and ODPs to specific Branches

### Requirement 34: Komdigi Regulatory Reporting

**User Story:** As a Superadmin/Admin, I want to generate regulatory reports for Komdigi, so that the ISP complies with Indonesian telecommunications reporting requirements.

#### Acceptance Criteria

1. THE Backend SHALL expose API endpoints to generate Komdigi package data reports listing all active service packages with their specifications
2. THE Backend SHALL expose API endpoints to generate Komdigi customer data reports including: total subscribers per package, subscriber distribution by Branch/region, and customer growth metrics
3. THE Backend SHALL expose API endpoints to generate Komdigi revenue reports including: monthly revenue totals, revenue breakdown by payment type, and revenue breakdown by payment handler (Admin, Mitra, Merchant)
4. THE Backend SHALL support exporting all Komdigi reports in Excel format

### Requirement 35: Financial Export and Reporting

**User Story:** As an Accounting user, I want to export financial reports in Excel format, so that I can perform advanced bookkeeping and reconciliation externally.

#### Acceptance Criteria

1. THE Backend SHALL expose API endpoints to generate financial reports including: income summary, outstanding receivables (tunggakan), technician cash advances (kasbon), and reconciliation data
2. THE Backend SHALL support filtering financial reports by: date range, Branch, payment method, and handler (Admin/Mitra/Merchant)
3. THE Backend SHALL support exporting financial reports in Excel (.xlsx) format
4. THE Backend SHALL include PPN (11%) breakdown in all financial reports where applicable

### Requirement 36: Customer Growth Reporting

**User Story:** As a Superadmin/Admin/Sales, I want to view customer growth analytics, so that I can track business performance and individual sales achievements.

#### Acceptance Criteria

1. THE Backend SHALL calculate net customer growth as: new activations minus churned customers (Terminated) per period
2. THE Backend SHALL support growth metrics calculation for: monthly (MoM) and yearly (YoY) periods
3. THE Backend SHALL map growth metrics by: Mitra, Branch, and individual Sales agent
4. THE Backend SHALL expose API endpoints returning growth data suitable for dashboard visualization (trend graphs, bar charts, KPI cards)
5. THE Backend SHALL support exporting growth reports in PDF and Excel formats

### Requirement 37: CAPEX and Expansion Budgeting

**User Story:** As a Tim Perencana, I want to create expansion budget proposals with automatic cost calculation, so that network expansion projects are properly planned and approved.

#### Acceptance Criteria

1. THE Backend SHALL store expansion project proposals with: target area, target customer count, required materials list (poles, cable, devices), and project status (Draft, Pending Approval, Approved, Rejected, In Progress, Completed)
2. WHEN a proposal is created, THE Backend SHALL automatically calculate the RAB (budget estimate) by referencing master asset prices from the inventory system
3. WHEN a proposal is approved by Management/Finance, THE Backend SHALL record the project as CAPEX and update the project status
4. WHEN a project is approved and required stock is insufficient, THE Backend SHALL generate a draft Purchase Order (PO) for the missing items
5. WHEN a project is approved and required stock is available, THE Backend SHALL reserve (allocate) the stock in the Branch warehouse for the project
6. THE Backend SHALL support proposal revision workflow where Management can request changes before approval

### Requirement 38: KPI Calculation and Tracking

**User Story:** As a Superadmin, I want monthly KPI scores calculated automatically for Sales and Teknisi, so that performance evaluation is objective and data-driven.

#### Acceptance Criteria

1. THE Backend SHALL calculate monthly KPI scores for Sales based on: target customer acquisitions versus actual new activations attributed to the Sales agent
2. THE Backend SHALL calculate monthly KPI scores for Teknisi based on: ticket resolution SLA compliance rate and installation quality metrics
3. THE Backend SHALL execute a scheduled job at the end of each month (payroll cycle) to pull performance data and calculate final KPI scores
4. WHEN a KPI score meets or exceeds the target threshold, THE Backend SHALL flag the employee for performance reward/incentive
5. THE Backend SHALL store KPI history per employee per month for trend analysis

### Requirement 39: Overtime Management

**User Story:** As an Admin, I want to track approved overtime hours for technicians, so that overtime compensation is calculated accurately.

#### Acceptance Criteria

1. WHEN a ticket dispatch requires work outside regular hours, THE Backend SHALL create an overtime request linked to the ticket and Teknisi
2. THE Backend SHALL store overtime records with: Teknisi ID, date, approved hours, linked ticket(s), approval status, and approver
3. WHEN overtime is approved, THE Backend SHALL calculate overtime compensation based on the approved hours and applicable rate
4. THE Backend SHALL include approved overtime data in the monthly payroll report

### Requirement 40: Payroll Report Generation

**User Story:** As a Finance/Management user, I want a consolidated payroll report including KPI rewards and overtime, so that employee compensation is processed accurately.

#### Acceptance Criteria

1. THE Backend SHALL generate a monthly payroll report consolidating: base KPI scores, reward/incentive amounts (for qualifying employees), and overtime compensation
2. THE Backend SHALL support a Management/Finance approval workflow for the payroll report before finalization
3. IF Management requests revision, THEN THE Backend SHALL allow recalculation of KPI scores and resubmission
4. WHEN the payroll report is approved, THE Backend SHALL mark it as final and make it available for salary slip generation
5. THE Backend SHALL expose API endpoints to retrieve individual employee salary slip data

### Requirement 41: FUP (Fair Usage Policy) Enforcement

**User Story:** As a Superadmin, I want to enforce quota-based speed reduction on applicable packages, so that bandwidth is managed fairly across all subscribers.

#### Acceptance Criteria

1. WHEN FUP is enabled for a package, THE Backend SHALL track cumulative data usage per subscription per billing cycle
2. WHEN a subscription exceeds the FUP quota threshold, THE Backend SHALL trigger a CoA request to the NAS to apply the reduced speed profile
3. WHEN a new billing cycle begins, THE Backend SHALL reset the FUP usage counter for all subscriptions and restore original speed profiles via CoA
4. THE Backend SHALL store FUP configuration per package including: quota threshold (GB), reduced upload speed, and reduced download speed

### Requirement 42: Scheduled Job Management

**User Story:** As a Superadmin, I want all scheduled jobs to run reliably and be auditable, so that automated business processes execute consistently.

#### Acceptance Criteria

1. THE Backend SHALL implement the following scheduled jobs: invoice generation (1st of month at 00:00), auto-isolir (10th of month at 23:59), notification broadcasts (configurable), KPI calculation (end of month), and NAS health polling (configurable interval)
2. WHEN a scheduled job executes, THE Backend SHALL log: job name, start time, end time, records processed, records failed, and overall status (Success/Partial/Failed)
3. IF a scheduled job fails partially, THEN THE Backend SHALL log the failed records and continue processing remaining records
4. THE Backend SHALL expose API endpoints for Superadmin to view scheduled job execution history and manually trigger a job re-run

### Requirement 43: Customer Self-Service

**User Story:** As a Pelanggan, I want to manage my account through the API, so that I can view my data and perform basic operations without contacting support.

#### Acceptance Criteria

1. THE Backend SHALL expose authenticated API endpoints for Pelanggan to: view their customer profile, view active service subscriptions, view billing history, view payment history, and view ticket history
2. THE Backend SHALL allow Pelanggan to change their WiFi password and SSID via the API, which triggers an ACS command to the customer ONU device
3. THE Backend SHALL allow Pelanggan to submit new trouble tickets via the API
4. THE Backend SHALL allow Pelanggan to request a package upgrade or downgrade via the API
5. THE Backend SHALL restrict Pelanggan API access to only their own data; requests for other customers' data SHALL return 403 Forbidden

### Requirement 44: Technician Work Journal

**User Story:** As a Teknisi, I want to record my daily work activities, so that my field operations are documented and auditable.

#### Acceptance Criteria

1. THE Backend SHALL allow Teknisi to create work journal entries linked to tickets or standalone activities
2. THE Backend SHALL store journal entries with: Teknisi ID, date, activity description, photo attachments, linked ticket ID (optional), location GPS coordinates, and timestamp
3. THE Backend SHALL expose API endpoints for Admin to view Teknisi work journals filtered by date range, Teknisi, and Branch

### Requirement 45: Installation Fee and Add-on Services

**User Story:** As an Admin, I want to configure installation fees and add-on service charges, so that first-month billing accurately reflects all costs.

#### Acceptance Criteria

1. THE Backend SHALL store installation fee configuration as a system setting that can be enabled or disabled per Branch
2. WHEN installation fee is enabled and a new customer is activated, THE Backend SHALL add the installation fee to the first invoice
3. THE Backend SHALL support recording add-on services used during installation (additional access points, extended cable, etc.) with their respective charges
4. WHEN add-on services are recorded by the Teknisi during installation, THE Backend SHALL include the add-on charges in the first invoice after Admin validation

### Requirement 46: Down Payment (DP) Management

**User Story:** As an Admin/Sales, I want to record customer down payments during registration, so that the DP amount is properly deducted from the first invoice.

#### Acceptance Criteria

1. WHEN a customer makes a down payment during registration, THE Backend SHALL record the DP amount, payment date, and receiving agent (Admin/Sales)
2. WHEN the first invoice is generated for a customer with a recorded DP, THE Backend SHALL deduct the DP amount from the total invoice amount
3. IF the DP amount exceeds the first invoice total, THEN THE Backend SHALL carry the remaining credit to the next billing cycle
4. THE Backend SHALL include DP transactions in the financial reconciliation reports

### Requirement 47: Coverage Check API

**User Story:** As a Sales/Mitra/Teknisi, I want to check network coverage for a customer location, so that I can confirm service availability before registration.

#### Acceptance Criteria

1. THE Backend SHALL expose an API endpoint that accepts GPS coordinates and returns available ODPs within a configurable radius
2. WHEN a coverage check is performed, THE Backend SHALL return: list of nearby active ODPs with available ports, distance from the requested coordinates, and the associated Branch
3. IF no active ODP with available ports is found within the coverage radius, THEN THE Backend SHALL return a response indicating the area is not covered
4. THE Backend SHALL allow Admin/Superadmin to configure the coverage check radius parameter

