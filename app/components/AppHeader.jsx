import Link from "next/link";

const navLinks = [
  { href: "/", label: "Головна" },
  { href: "/AdminPanel", label: "Admin Panel" },
  { href: "/test", label: "Test Bench" },
];

export default function AppHeader() {
  return (
    <header className="site-header">
      <div className="site-header__brand">
        <span className="brand-mark">⚡</span>
        <div>
          <p className="brand-label">Edge Device Blockchain Dashboard</p>
          <small>Приватний блокчейн для IoT-пристроїв</small>
        </div>
      </div>
      <nav className="site-nav">
        {navLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
        <a
          href="https://github.com/Morwo128/Volodymyr_FeI-21m"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}

