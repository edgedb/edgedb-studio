import {JSX, PropsWithChildren, useEffect, useRef, useState} from "react";

import cn from "@dbsof/common/utils/classNames";

import {SignOutIcon} from "../icons";
import {LoadingSkeleton} from "../loadingSkeleton";

import styles from "./userMenu.module.scss";

export function UserMenuSkeleton() {
  return <LoadingSkeleton className={styles.userMenuSkeleton} />;
}

export type ActionOrLink =
  | {
      action: () => void;
    }
  | {
      link: (props: PropsWithChildren<{className?: string}>) => JSX.Element;
    };

export interface UserMenuProps {
  className?: string;
  avatar: string | JSX.Element;
  name?: string | null;
  email?: string | null;
  signout: ActionOrLink;
  menuItems?: MenuItemProps[][];
}

export function UserMenu({className, ...props}: UserMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (menuOpen) {
      const listener = (e: MouseEvent) => {
        if (!menuRef.current?.contains(e.target as Node)) closeMenu();
      };

      window.addEventListener("click", listener, {capture: true});

      return () => {
        window.removeEventListener("click", listener, {capture: true});
      };
    }
  }, [menuOpen]);

  return (
    <div ref={menuRef} className={cn(styles.userMenu, className)}>
      <div
        className={styles.menuButton}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <UserAvatar avatar={props.avatar} />
      </div>

      {menuOpen ? (
        <UserMenuContent
          className={styles.menuDropdown}
          closeMenu={closeMenu}
          {...props}
        />
      ) : null}
    </div>
  );
}

export function UserMenuContent({
  className,
  closeMenu,
  signout,
  menuItems,
  ...user
}: UserMenuProps & {
  className?: string;
  closeMenu?: () => void;
}) {
  return (
    <div className={cn(styles.menuContent, className)}>
      <div className={styles.userCard}>
        <UserAvatar avatar={user.avatar} />
        <div className={styles.info}>
          <div className={styles.name}>{user.name ?? user.email}</div>
          {user.name && user.email ? (
            <div className={styles.subtitle}>{user.email}</div>
          ) : null}
        </div>
      </div>

      {menuItems
        ? menuItems.map((g, i) => (
            <div key={`menuGroup-${i}`} className={styles.menuItemsList}>
              {g.map((item, i) => (
                <MenuItem
                  key={`menuItem-${i}`}
                  {...item}
                  onClick={closeMenu}
                />
              ))}
            </div>
          ))
        : null}
      <div className={styles.menuItemsList}>
        <MenuItem label="Sign out" icon={<SignOutIcon />} {...signout} />
      </div>
    </div>
  );
}

export type MenuItemProps = (
  | {
      icon: JSX.Element;
      label: string;
    }
  | {component: JSX.Element}
) &
  (ActionOrLink | {});

function MenuItem(props: MenuItemProps & {onClick?: () => void}) {
  const El = "link" in props ? props.link : "div";
  return (
    <El
      className={cn(styles.menuItem, {
        [styles.hasAction]: "action" in props || "link" in props,
      })}
      onClick={
        "action" in props
          ? () => {
              props.onClick?.();
              props.action();
            }
          : "link" in props
          ? props.onClick
          : undefined
      }
    >
      {"component" in props ? (
        props.component
      ) : (
        <>
          <span>{props.label}</span>
          {props.icon}
        </>
      )}
    </El>
  );
}

function UserAvatar({avatar}: {avatar: string | JSX.Element}) {
  return typeof avatar === "string" ? (
    <div
      className={styles.avatar}
      style={{
        backgroundImage: `url(${avatar})`,
      }}
    />
  ) : (
    <div className={styles.avatar}>{avatar}</div>
  );
}
