import Image from "next/image";
import styles from "./page.module.css";
import EdgeDeviceApp from "./components/EdgeDeviceApp";

export default function Home() {
  return (
    <div className={styles.page}>
      <EdgeDeviceApp />
    </div>
  );
}
