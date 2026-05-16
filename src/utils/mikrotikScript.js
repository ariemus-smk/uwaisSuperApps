/**
 * Mikrotik RouterOS configuration script generator.
 * Generates complete NAS configuration scripts for Mikrotik routers
 * including VPN failover, RADIUS client, PPPoE server, Hotspot, and isolir rules.
 *
 * Requirements: 12.3
 */

/**
 * Generate a complete Mikrotik RouterOS script for a NAS device.
 * @param {object} nasConfig
 * @param {string} nasConfig.nasName - NAS device name
 * @param {object} nasConfig.vpnAccounts - VPN account configurations
 * @param {object} nasConfig.vpnAccounts.pptp - PPTP VPN config {username, password, server}
 * @param {object} nasConfig.vpnAccounts.l2tp - L2TP VPN config {username, password, server}
 * @param {object} nasConfig.vpnAccounts.sstp - SSTP VPN config {username, password, server}
 * @param {object} nasConfig.vpnAccounts.ovpn - OVPN VPN config {username, password, server}
 * @param {string} nasConfig.radiusSecret - RADIUS shared secret
 * @param {string} nasConfig.radiusServer - RADIUS server IP (via VPN tunnel)
 * @param {number} [nasConfig.radiusAuthPort=1812] - RADIUS auth port
 * @param {number} [nasConfig.radiusAcctPort=1813] - RADIUS accounting port
 * @param {number} [nasConfig.coaPort=3799] - CoA listening port
 * @param {string} [nasConfig.pppoeInterface='ether1'] - PPPoE server interface
 * @param {string} [nasConfig.hotspotInterface='ether2'] - Hotspot interface
 * @param {string} [nasConfig.isolirRedirectUrl='http://isolir.uwais.id'] - Isolir redirect URL
 * @returns {string} Complete Mikrotik RouterOS script
 */
function generateNasScript(nasConfig) {
  const {
    nasName,
    vpnAccounts,
    radiusSecret,
    radiusServer = '10.255.255.1',
    radiusAuthPort = 1812,
    radiusAcctPort = 1813,
    coaPort = 3799,
    pppoeInterface = 'ether1',
    hotspotInterface = 'ether2',
    isolirRedirectUrl = 'http://isolir.uwais.id',
  } = nasConfig;

  const sections = [];

  // Header
  sections.push(generateHeader(nasName));

  // VPN Failover Configuration
  sections.push(generateVpnFailover(vpnAccounts));

  // RADIUS Client Configuration
  sections.push(generateRadiusConfig(radiusSecret, radiusServer, radiusAuthPort, radiusAcctPort, coaPort));

  // PPPoE Server Profile Configuration
  sections.push(generatePppoeServer(pppoeInterface));

  // Hotspot User Profile Configuration
  sections.push(generateHotspotConfig(hotspotInterface));

  // Auto-Isolir Address_List Rules
  sections.push(generateIsolirRules(radiusServer));

  // Footer
  sections.push(generateFooter());

  return sections.join('\n\n');
}

/**
 * Generate script header comment.
 */
function generateHeader(nasName) {
  return `# ============================================================
# UwaisSuperApps - NAS Configuration Script
# Device: ${nasName}
# Generated: ${new Date().toISOString()}
# ============================================================
# WARNING: This script will overwrite existing VPN, RADIUS,
# PPPoE, Hotspot, and firewall configurations.
# Please backup your current configuration before applying.
# ============================================================`;
}

/**
 * Generate VPN failover configuration for 4 VPN types.
 */
function generateVpnFailover(vpnAccounts) {
  const { pptp, l2tp, sstp, ovpn } = vpnAccounts;

  return `# ============================================================
# SECTION 1: VPN Failover Configuration
# Priority: SSTP > L2TP > PPTP > OVPN
# ============================================================

# --- PPTP VPN Client ---
/interface pptp-client
add name=vpn-pptp connect-to=${pptp.server} user=${pptp.username} password=${pptp.password} \\
    disabled=no add-default-route=no profile=default

# --- L2TP VPN Client ---
/interface l2tp-client
add name=vpn-l2tp connect-to=${l2tp.server} user=${l2tp.username} password=${l2tp.password} \\
    use-ipsec=no disabled=no add-default-route=no profile=default

# --- SSTP VPN Client ---
/interface sstp-client
add name=vpn-sstp connect-to=${sstp.server}:${sstp.port || 443} user=${sstp.username} password=${sstp.password} \\
    disabled=no add-default-route=no profile=default verify-server-certificate=no

# --- OVPN VPN Client ---
/interface ovpn-client
add name=vpn-ovpn connect-to=${ovpn.server} port=${ovpn.port || 1194} user=${ovpn.username} password=${ovpn.password} \\
    disabled=no add-default-route=no protocol=tcp

# --- VPN Failover Routing (Recursive) ---
# Primary: SSTP (distance 1)
/ip route
add dst-address=10.255.255.0/24 gateway=vpn-sstp distance=1 comment="VPN-Primary-SSTP"
add dst-address=10.255.255.0/24 gateway=vpn-l2tp distance=2 comment="VPN-Secondary-L2TP"
add dst-address=10.255.255.0/24 gateway=vpn-pptp distance=3 comment="VPN-Tertiary-PPTP"
add dst-address=10.255.255.0/24 gateway=vpn-ovpn distance=4 comment="VPN-Quaternary-OVPN"

# --- Netwatch for VPN Health Check ---
/tool netwatch
add host=10.255.255.1 interval=30s timeout=5s \\
    up-script="/ip route set [find comment=\\"VPN-Primary-SSTP\\"] disabled=no" \\
    down-script="/ip route set [find comment=\\"VPN-Primary-SSTP\\"] disabled=yes"`;
}

/**
 * Generate RADIUS client configuration.
 */
function generateRadiusConfig(radiusSecret, radiusServer, authPort, acctPort, coaPort) {
  return `# ============================================================
# SECTION 2: RADIUS Client Configuration
# ============================================================

/radius
add service=ppp address=${radiusServer} secret=${radiusSecret} \\
    authentication-port=${authPort} accounting-port=${acctPort} \\
    timeout=3s called-id="%n" comment="UwaisApps-RADIUS"

add service=hotspot address=${radiusServer} secret=${radiusSecret} \\
    authentication-port=${authPort} accounting-port=${acctPort} \\
    timeout=3s comment="UwaisApps-RADIUS-Hotspot"

# Enable RADIUS incoming (CoA/POD)
/radius incoming
set accept=yes port=${coaPort}

# Enable RADIUS for PPP and Hotspot
/ppp aaa
set use-radius=yes accounting=yes interim-update=5m

/ip hotspot profile
set [find default=yes] use-radius=yes radius-accounting=yes`;
}

/**
 * Generate PPPoE server profile configuration.
 */
function generatePppoeServer(pppoeInterface) {
  return `# ============================================================
# SECTION 3: PPPoE Server Configuration
# ============================================================

# --- PPP Profile for PPPoE ---
/ppp profile
add name=pppoe-uwais local-address=10.10.0.1 \\
    dns-server=8.8.8.8,8.8.4.4 \\
    use-encryption=no use-compression=no \\
    change-tcp-mss=yes only-one=yes \\
    comment="UwaisApps PPPoE Profile"

# --- PPPoE Server ---
/interface pppoe-server server
add service-name=UwaisNet interface=${pppoeInterface} \\
    default-profile=pppoe-uwais \\
    authentication=pap,chap,mschap1,mschap2 \\
    one-session-per-host=yes \\
    max-mtu=1480 max-mru=1480 \\
    disabled=no comment="UwaisApps PPPoE Server"`;
}

/**
 * Generate Hotspot user profile configuration.
 */
function generateHotspotConfig(hotspotInterface) {
  return `# ============================================================
# SECTION 4: Hotspot Configuration
# ============================================================

# --- Hotspot Server Profile ---
/ip hotspot profile
add name=uwais-hotspot-profile \\
    hotspot-address=10.20.0.1 \\
    dns-name=hotspot.uwais.id \\
    use-radius=yes \\
    radius-accounting=yes \\
    login-by=http-chap,http-pap,mac-cookie \\
    comment="UwaisApps Hotspot Profile"

# --- IP Pool for Hotspot ---
/ip pool
add name=pool-hotspot ranges=10.20.0.2-10.20.3.254

# --- Hotspot Server ---
/ip hotspot
add name=uwais-hotspot interface=${hotspotInterface} \\
    address-pool=pool-hotspot \\
    profile=uwais-hotspot-profile \\
    disabled=no

# --- Hotspot User Profile ---
/ip hotspot user profile
add name=uwais-user-profile \\
    shared-users=1 \\
    rate-limit=0/0 \\
    transparent-proxy=yes \\
    comment="UwaisApps Hotspot User Profile"`;
}

/**
 * Generate auto-isolir Address_List firewall rules.
 */
function generateIsolirRules(radiusServer) {
  return `# ============================================================
# SECTION 5: Auto-Isolir Address_List Rules
# ============================================================

# --- Walled Garden for Isolir Page ---
/ip firewall filter
add chain=forward src-address-list=ISOLIR dst-address=${radiusServer} action=accept \\
    comment="UwaisApps: Allow isolir page access" \\
    place-before=0

# --- Firewall Filter: Block isolated customers ---
/ip firewall filter
add chain=forward src-address-list=ISOLIR action=drop \\
    comment="UwaisApps: Block isolir customers forward traffic" \\
    place-before=1

# --- Firewall NAT: Redirect isolated customers to warning page ---
/ip firewall nat
add action=dst-nat chain=dstnat dst-port=80,443 protocol=tcp src-address-list=ISOLIR \\
    to-addresses=${radiusServer} to-ports=3500 \\
    comment="UwaisApps: Redirect isolir HTTP/HTTPS to warning page"

# --- DNS Redirect for Isolated Customers ---
/ip firewall nat
add chain=dstnat src-address-list=ISOLIR dst-port=53 protocol=udp \\
    action=redirect to-ports=53 \\
    comment="UwaisApps: Redirect isolir DNS"`;
}

/**
 * Generate script footer.
 */
function generateFooter() {
  return `# ============================================================
# END OF CONFIGURATION SCRIPT
# ============================================================
# After applying this script:
# 1. Verify VPN connections are established
# 2. Test RADIUS authentication with a test account
# 3. Verify PPPoE server is accepting connections
# 4. Check firewall rules are in correct order
# ============================================================

/log info "UwaisApps NAS configuration script applied successfully"`;
}

module.exports = {
  generateNasScript,
};
