import { useState } from "react";
import PropTypes from "prop-types";
import { FiEye, FiEyeOff, FiLock } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/** Password input with the show/hide control used by every auth form. */
const PasswordField = ({ id, label, value, onChange, autoComplete, placeholder, minLength, required = false }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring">
        <FiLock className="text-muted-foreground" aria-hidden="true" />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="border-0 shadow-none focus-visible:ring-0"
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="text-muted-foreground"
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          aria-pressed={visible}
        >
          {visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
};

PasswordField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  autoComplete: PropTypes.string,
  placeholder: PropTypes.string,
  minLength: PropTypes.number,
  required: PropTypes.bool,
};

export default PasswordField;
